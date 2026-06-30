# Super Admin Phase 2 - Verification Tests

## Overview
This document contains verification tests for Phase 2 implementation covering all Super Admin order synchronization fixes.

---

## Test Suite 1: Admin Orders List (No Unpaid Orders)

### Test 1.1: List Contains Only Paid Orders
**Endpoint**: `GET /api/admin/orders`

**Setup**:
1. Create 5 test orders with mixed payment statuses:
   - Order 1: payment.status = 'verified' ✅
   - Order 2: payment.status = 'pending' ❌
   - Order 3: payment.status = 'failed' ❌
   - Order 4: payment.status = 'verified' ✅
   - Order 5: payment.status = 'refunded' ❌

**Verification Query**:
```sql
-- Should show ONLY 2 paid orders
SELECT COUNT(*) FROM orders o
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified';
-- Expected: 2
```

**Expected Result**:
- Response returns 2 orders (orders 1 and 4)
- Response does NOT include orders 2, 3, 5
- HTTP 200 OK

**Failure Scenario**:
- If response includes 5 orders → LEFT JOIN is still being used
- If response shows unpaid orders → Missing payment filter

---

### Test 1.2: Restaurant Name Displays Correctly
**Endpoint**: `GET /api/admin/orders`

**Setup**:
1. Create order with restaurant_id = 1
2. Restaurant table has: restaurant_id=1, name="Pizza Palace"

**Verification Query**:
```sql
-- Verify restaurant JOIN works
SELECT o.order_id, r.name AS restaurant_name
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified'
LIMIT 1;
-- Expected: restaurant_name = "Pizza Palace" (not NULL, not "—")
```

**Expected Result**:
- Order response includes `restaurant_name: "Pizza Palace"`
- No "—" or NULL values
- HTTP 200 OK

**Failure Scenario**:
- If `restaurant_name` is NULL → Missing restaurant JOIN
- If `restaurant_name` is "—" → Display logic issue
- If field missing entirely → Not selected in query

---

## Test Suite 2: Order Detail View

### Test 2.1: Cannot Access Unpaid Order Details
**Endpoint**: `GET /api/admin/orders/:id` (unpaid order)

**Setup**:
1. Create order with payment.status = 'pending'
2. Get order_id for this unpaid order

**Expected Result**:
```json
{
  "success": false,
  "message": "Order payment not verified. Cannot access details."
}
```
- HTTP 403 Forbidden

**Failure Scenario**:
- HTTP 200 with order details → Payment verification not enforced
- HTTP 404 → Wrong error code (should be 403)
- Different error message → Verification check missing

---

### Test 2.2: Paid Order Shows Restaurant Details
**Endpoint**: `GET /api/admin/orders/:id` (paid order)

**Setup**:
1. Create paid order (payment.status = 'verified')
2. Order belongs to restaurant_id = 5
3. Restaurant has name = "Burger Barn"

**Verification Query**:
```sql
-- Check order detail includes restaurant
SELECT o.*, r.name AS restaurant_name
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
WHERE o.order_id = ?;
```

**Expected Result**:
- HTTP 200 OK
- Response includes: `restaurant_name: "Burger Barn"`
- Response includes: `payment_status: "verified"`
- Response includes: `payment_amount: (actual amount)`

**Failure Scenario**:
- `restaurant_name` missing → Restaurant not JOINed
- `payment_status` missing → Payment details not included
- Field shows "—" → Display issue in frontend

---

## Test Suite 3: Order Status Update

### Test 3.1: Cannot Update Unpaid Order Status
**Endpoint**: `PUT /api/admin/orders/:id/status`
**Body**: `{ "status": "preparing" }`

**Setup**:
1. Create order with payment.status = 'pending'
2. Current order status = 'pending'

**Expected Result**:
```json
{
  "success": false,
  "message": "Cannot update unpaid orders. Payment must be verified first."
}
```
- HTTP 403 Forbidden
- Order status still = 'pending' (unchanged)

**Verification Query**:
```sql
-- Verify status wasn't updated
SELECT status FROM orders WHERE order_id = ?;
-- Expected: 'pending' (unchanged)
```

**Failure Scenario**:
- HTTP 200 with success → Payment verification missing
- Order status changed to 'preparing' → Check not enforced
- Different error message → Verification message not set

---

### Test 3.2: Can Update Paid Order Status
**Endpoint**: `PUT /api/admin/orders/:id/status`
**Body**: `{ "status": "processing" }`

**Setup**:
1. Create order with payment.status = 'verified'
2. Current order status = 'pending'

**Expected Result**:
- HTTP 200 OK
```json
{
  "success": true,
  "message": "Order status updated to processing."
}
```

**Verification Query**:
```sql
-- Verify status was updated
SELECT status FROM orders WHERE order_id = ?;
-- Expected: 'processing' (changed)
```

**Failure Scenario**:
- HTTP 403 → Verification too strict
- Status not updated → Update query not running
- Wrong message → Different status path

---

## Test Suite 4: Dashboard Statistics

### Test 4.1: Orders Today Counts Only Paid
**Endpoint**: `GET /api/admin/stats`

**Setup**:
1. Today's date: 2024-01-15
2. Today's orders:
   - Order A (paid, verified): ✅
   - Order B (paid, verified): ✅
   - Order C (unpaid, pending): ❌
   - Order D (unpaid, failed): ❌

**Verification Query**:
```sql
-- Manual count of paid orders today
SELECT COUNT(DISTINCT o.order_id) FROM orders o
JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified' AND DATE(o.created_at) = CURDATE();
-- Expected: 2
```

**Expected Result**:
- Response includes: `ordersToday: 2`
- Does NOT include unpaid orders
- HTTP 200 OK

**Failure Scenario**:
- `ordersToday: 4` → Counting unpaid orders (no payment filter)
- `ordersToday: -1` or error → Query syntax issue

---

### Test 4.2: Active Orders Counts Only Paid
**Endpoint**: `GET /api/admin/stats`

**Setup**:
1. Active order statuses: ['pending', 'processing', 'preparing', 'out_for_delivery']
2. Sample data:
   - Order X (status='processing', paid): ✅
   - Order Y (status='preparing', paid): ✅
   - Order Z (status='processing', unpaid): ❌

**Verification Query**:
```sql
-- Manual count of active paid orders
SELECT COUNT(DISTINCT o.order_id) FROM orders o
JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified' 
  AND o.status IN ('pending','processing','preparing','out_for_delivery');
-- Expected: 2
```

**Expected Result**:
- Response includes: `activeOrders: 2`
- Unpaid orders excluded
- HTTP 200 OK

**Failure Scenario**:
- `activeOrders: 3` → Counting unpaid orders
- `activeOrders: 0` → Query not running

---

## Test Suite 5: Super Admin Orders Endpoint

### Test 5.1: Super Admin Can List All Paid Orders
**Endpoint**: `GET /api/super-admin/orders`

**Setup**:
1. 10 total orders in system
2. 6 orders with payment.status = 'verified'
3. 4 orders with payment.status = 'pending' or 'failed'

**Verification Query**:
```sql
-- Count verified orders
SELECT COUNT(*) FROM orders o
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified';
-- Expected: 6
```

**Expected Result**:
- Response includes: 6 orders
- Response does NOT include 4 unpaid orders
- HTTP 200 OK

**Failure Scenario**:
- Response shows 10 orders → Payment filter missing
- Response shows 0 orders → INNER JOIN too strict
- Error message about endpoint → Route not added

---

### Test 5.2: Super Admin Orders Include Restaurant Info
**Endpoint**: `GET /api/super-admin/orders`

**Setup**:
1. Create 3 paid orders from different restaurants
   - Order 1: restaurant_id=1, name="Cafe Max"
   - Order 2: restaurant_id=2, name="Taco Town"
   - Order 3: restaurant_id=1, name="Cafe Max"

**Verification Query**:
```sql
-- Check restaurant names in response
SELECT o.order_id, r.name AS restaurant_name
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified'
ORDER BY o.created_at DESC;
```

**Expected Result**:
- All 3 orders in response
- Each includes: `restaurant_name` with proper value
- Order 1 shows: "Cafe Max"
- Order 2 shows: "Taco Town"
- Order 3 shows: "Cafe Max"
- No "—" or NULL values
- HTTP 200 OK

**Failure Scenario**:
- `restaurant_name` field missing → Not in SELECT
- `restaurant_name` is NULL → Restaurant JOIN missing
- `restaurant_name` is "—" → Display formatting issue

---

### Test 5.3: Super Admin Can Filter by Restaurant
**Endpoint**: `GET /api/super-admin/orders?restaurant_id=1`

**Setup**:
1. 6 total paid orders across 3 restaurants
2. Restaurant ID 1 has 2 paid orders

**Verification Query**:
```sql
-- Count orders for restaurant 1
SELECT COUNT(*) FROM orders o
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified' AND o.restaurant_id = 1;
-- Expected: 2
```

**Expected Result**:
- Response includes: 2 orders (only from restaurant 1)
- HTTP 200 OK

**Failure Scenario**:
- Response shows all 6 orders → Filter not applied
- Response shows 0 orders → Filter too restrictive

---

### Test 5.4: Super Admin Can Filter by Order Status
**Endpoint**: `GET /api/super-admin/orders?status=preparing`

**Setup**:
1. 6 total paid orders
2. 3 orders with status='preparing'
3. 3 orders with other statuses

**Verification Query**:
```sql
-- Count preparing paid orders
SELECT COUNT(*) FROM orders o
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified' AND o.status = 'preparing';
-- Expected: 3
```

**Expected Result**:
- Response includes: 3 orders
- All with status='preparing'
- HTTP 200 OK

**Failure Scenario**:
- Response shows all 6 orders → Status filter not applied
- Response shows 0 orders → Filter broken

---

## Test Suite 6: Payment Synchronization

### Test 6.1: Order Lifecycle Requires Payment Confirmation
**Sequence**:
1. Create order → status='pending'
2. payment created → status='pending'
3. Try to update order status to 'processing' → 403 Forbidden
4. Confirm payment → payment.status='verified'
5. Update order status to 'processing' → 200 OK, status updated

**Verification Queries**:

```sql
-- Step 1: Order created unpaid
SELECT o.status, p.status FROM orders o
LEFT JOIN payments p ON o.order_id = p.order_id
WHERE o.order_id = ?;
-- Expected: o.status='pending', p.status='pending'

-- Step 2: Try to update (should fail)
-- API call should return 403

-- Step 3: Payment confirmed
SELECT p.status FROM payments WHERE order_id = ?;
-- Expected: 'verified'

-- Step 4: Status update succeeds
SELECT o.status FROM orders WHERE order_id = ?;
-- Expected: 'processing'
```

**Expected Result**:
- Step 1: Order and payment both pending
- Step 2: 403 Forbidden response
- Step 3: Payment verified
- Step 4: 200 OK, status updated

**Failure Scenario**:
- Step 2 returns 200 → Payment verification not enforced
- Step 4 returns 403 → Verification too strict after confirmation

---

## Summary Verification Checklist

- [ ] Admin orders list only shows paid orders (INNER JOIN working)
- [ ] Restaurant names display properly (no "—")
- [ ] Cannot access unpaid order details (403 response)
- [ ] Cannot update unpaid order status (403 response)
- [ ] Can access paid order details (200 response with restaurant)
- [ ] Can update paid order status (200 response)
- [ ] Dashboard counts only paid orders
- [ ] Active orders stat accurate
- [ ] Super Admin orders endpoint exists
- [ ] Super Admin sees all paid orders
- [ ] Super Admin can filter by restaurant
- [ ] Super Admin can filter by order status
- [ ] Order lifecycle enforces payment confirmation

---

## Database State Verification

### Check 1: Verify JOINs Work
```sql
-- Should show restaurants for all paid orders
SELECT o.order_id, r.name, p.status
FROM orders o
JOIN restaurants r ON r.restaurant_id = o.restaurant_id
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified'
LIMIT 10;
-- All rows should have restaurant name (no NULL)
```

### Check 2: Verify COUNT Accuracy
```sql
-- Should match dashboard stats
SELECT 
  COUNT(DISTINCT o.order_id) AS total_paid,
  SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_paid
FROM orders o
INNER JOIN payments p ON o.order_id = p.order_id
WHERE p.status = 'verified';
```

### Check 3: Verify No Unpaid in Admin Views
```sql
-- Should return 0 if working correctly
SELECT COUNT(*) FROM orders o
LEFT JOIN payments p ON o.order_id = p.order_id
WHERE p.status IS NULL OR p.status != 'verified'
  AND o.order_id IN (SELECT order_id FROM (
    -- This would be the orders shown in admin list
  ) AS admin_orders);
-- Expected: 0
```

---

## Notes

- All tests should be run after payment confirmation system is verified working
- Use test database to avoid affecting production data
- Some tests may require multiple API calls in sequence
- Restaurant and payment data must exist before running tests
- Expected HTTP status codes: 200 (success), 403 (forbidden), 404 (not found)

