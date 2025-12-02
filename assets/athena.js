// /assets/athena.js

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('athena-toggle');
  const panel  = document.getElementById('athena-panel');
  const chat   = document.getElementById('athena-chat');

  // Άνοιγμα / κλείσιμο panel
  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      const isOpen = panel.style.display === 'block';
      panel.style.display = isOpen ? 'none' : 'block';
    });
  }

  // Ρυθμίσεις ChatKit (θέμα, γλώσσα κ.λπ.)
  if (chat) {
    // Αν έχεις ήδη βάλει deployment/assistant στο HTML, δεν τα πειράζουμε εδώ.
    // Κλειδώνουμε μόνο το theme και τη γλώσσα.
    chat.setAttribute('theme', 'light');   // light θέμα για άσπρο φόντο, σκούρα γράμματα
    chat.setAttribute('locale', 'el');     // ελληνικά labels στο UI, όπου υποστηρίζεται
  }
});
