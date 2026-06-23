const STORAGE_KEY = "zestoCart";
const DELIVERY_FEE = 5000;

function getCart() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function formatPrice(value) {
    return `UGX ${value.toLocaleString()}`;
}
function getCart() {
    const cart = JSON.parse(localStorage.getItem("zestoCart") || "[]");
    console.log("Cart Data:", cart);
    return cart;
}

function renderSummary() {
    const cart = getCart();

    console.log("Checkout Cart:", cart); 
    

    if (cart.length === 0) {
        console.warn("Cart is empty");
    }

    const itemsContainer = document.getElementById("orderItems");
    const subtotalEl = document.getElementById("subtotal");
    const totalEl = document.getElementById("total");
    const cartCount = document.getElementById("navCartCount");

    let subtotal = 0;
    let totalQty = 0;

    itemsContainer.innerHTML = "";

    cart.forEach(item => {

        subtotal += item.price * item.qty;
        totalQty += item.qty;

        itemsContainer.innerHTML += `
            <div class="order-item">
                <span>${item.name} × ${item.qty}</span>
                <span>${formatPrice(item.price * item.qty)}</span>
            </div>
        `;
    });

    cartCount.textContent = totalQty;

    subtotalEl.textContent = formatPrice(subtotal);
    totalEl.textContent = formatPrice(subtotal + DELIVERY_FEE);
}

document.addEventListener("DOMContentLoaded", () => {

    renderSummary();

    document.getElementById("placeOrderBtn")
        .addEventListener("click", () => {

            const fullName = document.getElementById("fullName").value;
            const email = document.getElementById("email").value;
            const phone = document.getElementById("phone").value;
            const address = document.getElementById("address").value;

            if (!fullName || !email || !phone || !address) {
                alert("Please fill in all required fields.");
                return;
            }

            alert(
                `Order placed successfully!\n\n` +
                `Customer: ${fullName}\n` +
                `Phone: ${phone}`
            );

            localStorage.removeItem(STORAGE_KEY);

            window.location.href = "order.html";
        });
        
    const fullName = document.getElementById("fullName");
    const email = document.getElementById("email");
    const phone = document.getElementById("phone");
    const address = document.getElementById("address");
    const placeOrderBtn = document.getElementById("placeOrderBtn");

    function validateForm() {
        const isValid =
            fullName.value.trim() !== "" &&
            email.value.trim() !== "" &&
            phone.value.trim() !== "" &&
            address.value.trim() !== "";

        placeOrderBtn.disabled = !isValid;
    }

    fullName.addEventListener("input", validateForm);
    email.addEventListener("input", validateForm);
    phone.addEventListener("input", validateForm);
    address.addEventListener("input", validateForm);

    validateForm();
});