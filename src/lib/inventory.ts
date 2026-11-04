import { badRequest } from "./errors";

// Shared stock deduction, used by both order creation and order status
// changes. Previously deduction lived only in the PATCH-to-Shipped branch,
// so an order created directly as Delivered (the normal UI flow for a
// completed sale) never deducted stock at all — the live 2026-11-04 pilot
// test showed On hand still 10 after a delivered 2-unit order.
// Rule: deduct once, idempotently, when an order first reaches Shipped or
// Delivered, whether by creation or by status change. A later move from
// Shipped to Delivered must not deduct twice (checked via the existing
// stock-out movement for this order).
type TxClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export async function deductStockForOrder(
  c: TxClient,
  workspaceId: string,
  orderId: string,
  userId: string
): Promise<void> {
  const existing = (
    await c.query(
      "SELECT id FROM inventory_movements WHERE workspace_id=$1 AND related_order_id=$2 AND movement_type='stock-out'",
      [workspaceId, orderId]
    )
  ).rows[0];
  if (existing) return;
  const ws = (
    await c.query("SELECT allow_negative_stock FROM workspaces WHERE id=$1", [workspaceId])
  ).rows[0];
  const items = (
    await c.query("SELECT * FROM order_items WHERE order_id=$1 AND workspace_id=$2", [orderId, workspaceId])
  ).rows;
  for (const item of items) {
    if (!item.product_id) continue;
    const p = (
      await c.query("SELECT on_hand FROM products WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [
        item.product_id,
        workspaceId,
      ])
    ).rows[0];
    if (!p) continue;
    const next = Number(p.on_hand) - Number(item.quantity);
    if (next < 0 && !ws?.allow_negative_stock) {
      throw badRequest(
        `Insufficient stock for ${item.sku_snapshot}: ${p.on_hand} on hand, ${item.quantity} needed. Enable the owner override in Settings or add stock first.`
      );
    }
    await c.query("UPDATE products SET on_hand=$1 WHERE id=$2", [next, item.product_id]);
    await c.query(
      "INSERT INTO inventory_movements (workspace_id, product_id, movement_type, quantity_delta, unit_cost, related_order_id, reason, created_by) VALUES ($1,$2,'stock-out',$3,$4,$5,'Order shipped',$6)",
      [workspaceId, item.product_id, -Number(item.quantity), item.unit_cost_snapshot, orderId, userId]
    );
  }
}
