// Dynamically load MathJax script
(function () {
  if (window.MathJax) return;

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

// Optional: Clean solution if needed before rendering with MathJax
function cleanSolutionForRender(solution) {
  return solution
    .replace(/\\slash/g, '/')       // Replaces \slash with /
    .replace(/\\times/g, '×')       // Replaces \times with ×
    .replace(/\\div/g, '÷')         // Replaces \div with ÷
    .replace(/\\cdot/g, '*')        // Replaces \cdot with *
    .replace(/\\pi/g, 'π')          // Replaces \pi with π
    .replace(/\\pm/g, '±')          // Replaces \pm with ±
    .replace(/\\approx/g, '≈')      // Replaces \approx with ≈
    .replace(/\\forall/g, 'for all')
    .replace(/\\neq/g, '≠')
    .replace(/\\left|\\right/g, '')
    .replace(/\\_/g, '_');
}
