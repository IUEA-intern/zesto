# Real-Time Updates Implementation - Socket.io Integration

## Overview
Implemented live Socket.io updates for Restaurant Admin and Super Admin dashboards. Orders, payments, and statuses now update automatically without page refresh.

## Architecture

### Backend (Node.js)

#### Socket.io Setup
- **File**: `backend/src/index.js`
- Socket.io server initialized with CORS credentials
- Socket emitters attached to Express app via `app.set('socketEmitters', initSocketManager(io))`

#### Socket Manager (`backend/src/events/socketManager.js`)
- **Rooms**:
  - `admin:dashboard` - Super Admin dashboard
  - `restaurant:{restaurantId}` - Restaurant Admin dashboard (specific restaurant)
  - `user:{userId}` - Individual user notifications
  - `order:{orderId}` - Order tracking for customers
  - `kitchen:live_updates` - Kitchen display system

- **Key Methods Added**:
  - `restaurantOrderUpdate(restaurantId, orderData)` - Emit to specific restaurant
  - `restaurantNewOrder(restaurantId, orderData)` - New order for restaurant

#### Socket Events

**When order is created** (after payment verified):
```
Order → Payment → restaurantNewOrder() → restaurant:{id} room
                → adminNewOrder() → admin:dashboard room
                → kitchenNewOrder() → kitchen:live_updates room
```

**When order status changes**:
```
Restaurant Admin Action → updateOrderStatus() → adminOrderUpdate() → admin:dashboard
                                              → restaurantOrderUpdate() → restaurant:{id}
                                              → toastUser() → user:{id}
```

**When payment is verified**:
```
Payment Webhook → verifyPayment() → adminOrderUpdate() → admin:dashboard
                                   → restaurantOrderUpdate() → restaurant:{id}
                                   → paymentStatus() → user:{id}
```

### Frontend

#### Restaurant Admin Dashboard (`frontend-src/restaurant-admin/restaurant-admin.js`)

**Socket Connection**:
```javascript
State.socket = io({ 
  credentials: true, 
  reconnection: true, 
  reconnectionDelay: 1000, 
  reconnectionDelayMax: 5000 
});
```

**Joining**:
```javascript
State.socket.emit('restaurant:join', State.restaurantId);
```
Restaurant ID fetched from dashboard API (`/restaurant/dashboard` returns `restaurantId`)

**Event Listeners**:
- `order:new` - New paid order received
  - Adds to feed
  - Refreshes KPIs
  - Reloads orders table if viewing orders page

- `order:update` - Order status changed
  - Updates table row status cell instantly
  - Updates action buttons based on new status
  - Refreshes KPIs

- `payment:verified` - Payment confirmed
  - Refreshes dashboard KPIs
  - Reloads orders if on orders page

**Live Indicator**: Green dot shows connection status

#### Super Admin Dashboard (`frontend-src/admin/admin.js`)

**Socket Connection**: Same setup as restaurant admin

**Joining**:
```javascript
State.socket.emit('admin:join');
```

**Event Listeners**: Same event types as restaurant admin
- `order:new`
- `order:update`
- `payment:verified`

### Database

No schema changes required. Uses existing enum values:
```sql
status ENUM('pending','processing','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled')
```

## Key Design Decisions

### 1. **Database First, Then Socket Emit**
✅ **CRITICAL**: All socket emissions happen AFTER successful database updates:
```javascript
// ✅ CORRECT
await query('UPDATE orders SET status=?', [status]);  // DB success first
se.adminOrderUpdate({ orderId, status });             // Then emit

// ❌ NEVER DO THIS
se.adminOrderUpdate({ orderId, status });  // Emit first
await query('UPDATE orders SET status=?', [status]);  // DB update - might fail!
```

### 2. **Non-Blocking Socket Emissions**
Socket failures don't crash the API response:
```javascript
try {
  // Emit events
} catch (socketErr) {
  // Log but don't throw
  console.error('Socket emission failed:', socketErr.message);
}
```

### 3. **Room-Based Isolation**
- Admin sees ALL orders (admin:dashboard)
- Restaurant sees ONLY their orders (restaurant:{id})
- Users see notifications for their orders (user:{id})
- No global broadcast spam

### 4. **Graceful Reconnection**
- Auto-reconnect with exponential backoff
- On reconnect, reload current page data
- Live indicator shows connection status

## Implementation Files

### Modified Backend Files
1. `backend/src/events/socketManager.js` ✅
   - Added `restaurant:join` event handler
   - Added `restaurantOrderUpdate()` emitter
   - Added `restaurantNewOrder()` emitter

2. `backend/src/controllers/restaurantAdminController.js` ✅
   - Enhanced `updateOrderStatus()` to emit to restaurant room
   - Emit both to admin dashboard AND restaurant room

3. `backend/src/controllers/paymentController.js` ✅
   - Added restaurant room emissions in `verifyPayment()`
   - Emit `restaurantNewOrder()` and `restaurantOrderUpdate()`

### Modified Frontend Files
1. `frontend-src/restaurant-admin/restaurant-admin.js` ✅
   - Added `restaurantId` to State
   - Enhanced `initSocket()` with reconnection, event listeners
   - Added `updateOrderRowButtons()` helper for live status updates
   - Updated `loadOrders()` to add `data-order-id` attributes
   - Enhanced `refreshKPIs()` to capture restaurant ID

2. `frontend-src/admin/admin.js` ✅
   - Enhanced `initSocket()` with reconnection, event listeners
   - Updated order rows with `data-order-id` attributes

## Testing

### Prerequisites
1. Backend running: `npm run dev` in `/backend`
2. Frontend served on `http://localhost:5000` (or configured CORS origin)
3. Socket.io client library loaded: `<script src="/socket.io/socket.io.js"></script>`

### Test Scenarios

#### Test 1: Restaurant Receives New Order
1. Sign in as customer
2. Place order with payment
3. Open Restaurant Admin dashboard
4. **Expected**: New order appears instantly without refresh
5. **Check**: Feed item appears + pending orders badge updates

#### Test 2: Live Status Update
1. Sign in as restaurant admin
2. View Orders page
3. Open another tab with customer view
4. Customer: Click "Ready"
5. **Expected**: Order status updates instantly in restaurant admin
6. **Check**: No page reload, status pill updates, buttons change

#### Test 3: Reconnection
1. Sign in to dashboard
2. Open browser dev tools: Network throttling → "Offline"
3. Perform action (e.g., mark order ready)
4. Set throttling to "Online"
5. **Expected**: Socket reconnects automatically (live indicator returns to green)
6. **Check**: Previous action succeeds after reconnect

#### Test 4: Multi-Tab Synchronization
1. Open Restaurant Admin in 2 tabs
2. Tab A: Mark order as "Preparing"
3. Tab B: **Expected**: Status updates automatically
4. Check: No duplicate rows, consistent state

#### Test 5: Payment Webhook
1. Customer places order
2. Wait for payment webhook
3. **Expected**: Order appears in restaurant admin immediately
4. Check: Feed item + table row appear without manual refresh

### Browser Console Logs to Check
```javascript
// Connection
🔌 Socket connected to restaurant 1

// Reconnection
🔌 Socket disconnected: io server disconnect
🔄 Socket reconnected

// Events
📦 New order event: {orderId: 14, ...}
🔄 Order update event: {orderId: 14, status: 'ready_for_pickup'}
✅ Updated order 14 to ready_for_pickup
💳 Payment verified event: {orderId: 14, ...}
```

## Performance Considerations

- **Minimal DOM Updates**: Only updates changed cells, not full table reload
- **Efficient Socket Payload**: Events include minimal data needed for UI update
- **Deduplication**: Same event data won't create duplicate rows (checked by order ID)
- **Scaling**: Room-based architecture ready for Redis adapter for multi-server deployment

## Error Handling

### Socket Emission Failures (Non-Critical)
- Logged to console
- Request succeeds (DB updated)
- User won't see error (background sync)

### Database Failures (Critical)
- Full error response sent to client
- Socket not emitted
- Transaction rollback (if supported)

### Connection Losses
- Automatic reconnect with backoff
- Live indicator shows status
- Manual refresh available if needed

## Security

✅ **Authentication**: Socket.io credentials: true (sends cookies)
✅ **Authorization**: Room access controlled by backend
✅ **XSS Prevention**: Utils.escape() on all displayed data
✅ **CSRF**: Credentials-based authentication prevents CSRF

## Future Enhancements

1. **Redis Adapter**: For multi-server deployments
   ```javascript
   const io = new Server(server, { adapter: redisAdapter() });
   ```

2. **Presence Tracking**: Show who's currently viewing orders
   ```javascript
   socket.on('restaurant:viewing', (page) => {...}
   ```

3. **Typing Indicators**: For notes/comments
   ```javascript
   socket.emit('order:typing', { orderId, userId });
   ```

4. **Undo/Redo**: History of status changes
   ```javascript
   socket.emit('order:history', { orderId });
   ```

5. **Bulk Operations**: Update multiple orders
   ```javascript
   socket.emit('orders:status_bulk', { ids, status });
   ```

## Troubleshooting

### Orders not updating
- [ ] Check browser console for socket errors
- [ ] Verify `restaurantId` is captured (should show in logs)
- [ ] Check backend logs for emission errors
- [ ] Verify connection status (live indicator green)

### Socket not connecting
- [ ] Check CORS origin in backend config
- [ ] Verify Socket.io script is loaded
- [ ] Check backend firewall/proxy settings
- [ ] Verify credentials: true in socket options

### Duplicate rows appearing
- [ ] Check `data-order-id` attributes are unique
- [ ] Verify `updateOrderRowButtons()` is called correctly
- [ ] Check for multiple event listeners (page reload issue)

### Performance issues
- [ ] Check event throttling (limit to 10 events/sec)
- [ ] Monitor socket.io memory usage
- [ ] Verify no infinite loops in event handlers
- [ ] Use Performance tab in dev tools

---

## Status: ✅ COMPLETE

All socket.io real-time updates implemented and ready for testing.

**Key Benefits**:
- ✅ Orders update instantly
- ✅ Payments reflected immediately
- ✅ Status changes live without refresh
- ✅ Multi-device synchronization
- ✅ Auto-reconnection on connection drop
- ✅ Clean, minimal, production-ready code
