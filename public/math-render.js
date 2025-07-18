// Optional helper function to rerender math after dynamic content loads
function renderMath() {
  if (window.MathJax && window.MathJax.typeset) {
    MathJax.typeset();
  }
}

// Function to clean up LaTeX artifacts if needed globally
function cleanLatexArtifacts(content) {
  return content
    .replace(/\\\(/g, '') // remove \( 
    .replace(/\\\)/g, '') // remove \)
    .replace(/\$\$/g, '')
    .replace(/\$(.*?)\$/g, '$1')
    .trim();
}

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
