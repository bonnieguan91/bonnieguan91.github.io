(function () {
  "use strict";

  const dialog = document.querySelector("#paymentDialog");

  document.querySelectorAll("[data-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#selectedPlan").textContent = button.dataset.plan;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  });

  document.querySelector("#closePaymentDialog").addEventListener("click", () => dialog.close());
  document.querySelector(".dialog-pricing-link").addEventListener("click", () => dialog.close());
})();
