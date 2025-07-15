
// Dynamically load MathJax script
(function () {
  // Check if MathJax is already loaded
  if (window.MathJax) return;

  // Set up MathJax configuration before loading it
  window.MathJax = {
    tex: {
      inlineMath: [['\\(', '\\)']],
      displayMath: [['\\[', '\\]']],
      processEscapes: true,
      packages: { '[+]': ['base', 'ams', 'mhchem'] },
      macros: {
        '\\times': '\\text{×}',
        '\\div': '\\text{÷}',
        '\\plus': '+',
        '\\minus': '-'
      }
    },
    loader: { load: ['[tex]/ams', '[tex]/mhchem'] },
    options: {
      renderActions: {
        addMenu: []
      }
    }
  };

  // Create and insert the MathJax script tag
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
  script.async = true;
  document.head.appendChild(script);
})();

// Optional helper function to rerender math after dynamic content loads
function renderMath() {
  if (window.MathJax && window.MathJax.typeset) {
    MathJax.typeset();
  }
}
