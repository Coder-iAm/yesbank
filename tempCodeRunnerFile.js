const result = await response.json();
if (result.success) {
    
    const toast = document.querySelector(".toast");
    toast.innerHTML = `<span class='icon'>✔</span> Transaction successful! ₹${amount} has been sent to account ${receiverAccount}!`;
toast.style.backgroundColor = "#dff0d8"; // Light green
toast.style.color = "#3c763d"; 
toast.classList.add("show");
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => {
            toast.classList.remove("show", "hide");
        }, 3500);
    }, 4000);
} else {
    const toast = document.querySelector(".toast");
    toast.innerHTML = `<span class='icon'>⚠</span> please try again later!`;
    toast.style.backgroundColor = "#f2dede"; // Light red
    toast.style.color = "#a94442"; // Dark red
    toast.classList.add("show");
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => {
            toast.classList.remove("show", "hide");
        }, 3500);
    }, 4000);
}
} catch (error) {
console.error("Error:", error)

<div class="profile" >
<img src="img/picture_pro.jpg" alt="Admin">
<span>Admin</span>
</div>
<p><strong>Name:</strong> John Doe</p>
<p><strong>Username:</strong> admin123</p>
<p><strong>UPI ID:</strong> admin@yesbank</p>
<p><strong>Account No:</strong> 1234 5678 9012</p>
<p><strong>Balance:</strong> ₹25,000</p>

<a href="/" class="logout-btn">Log Out</a>