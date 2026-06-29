-- Payment integrity cleanup.
-- Run once before adding uq_pay_order on databases that already contain duplicates.
-- Keeps one payment row per order, preferring verified, then newest pending with a gateway reference, then newest row.

USE zesto_db_2;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS payments_cleanup_archive LIKE payments;

INSERT IGNORE INTO payments_cleanup_archive
SELECT p.*
FROM payments p
JOIN (
  SELECT p1.payment_id
  FROM payments p1
  LEFT JOIN payments p2
    ON p2.order_id = p1.order_id
   AND (
      (p2.status = 'verified' AND p1.status <> 'verified')
      OR (p2.status = p1.status AND COALESCE(p2.flw_tx_ref, '') <> '' AND COALESCE(p1.flw_tx_ref, '') = '')
      OR (p2.status = p1.status AND (COALESCE(p2.flw_tx_ref, '') <> '') = (COALESCE(p1.flw_tx_ref, '') <> '') AND p2.payment_id > p1.payment_id)
   )
  WHERE p2.payment_id IS NOT NULL
) d ON d.payment_id = p.payment_id;

DELETE p
FROM payments p
JOIN payments_cleanup_archive a ON a.payment_id = p.payment_id;

ALTER TABLE payments
  MODIFY status ENUM('pending','verified','failed','expired','refunded') NOT NULL DEFAULT 'pending';

UPDATE payments
SET status = 'expired',
    failure_reason = COALESCE(failure_reason, 'Expired before gateway confirmation'),
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'pending'
  AND created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR);

ALTER TABLE payments
  ADD UNIQUE KEY uq_pay_order (order_id);

COMMIT;
