document.addEventListener('DOMContentLoaded', () => {
  const problemInput = document.getElementById('problemInput');
  const imageUpload = document.getElementById('imageUpload');
  const solveBtn = document.getElementById('solveBtn');
  const solutionOutput = document.getElementById('solutionOutput');
  const loader = document.getElementById('loader');
  const imagePreview = document.getElementById('imagePreview');

  solveBtn.addEventListener('click', solveProblem);
  imageUpload.addEventListener('change', handleImageUpload);

  async function solveProblem() {
    const problem = problemInput.value.trim();

    if (!problem && !imageUpload.files[0]) {
      alert('Please enter a problem or upload an image');
      return;
    }

    try {
      showLoading(true);
      solutionOutput.innerHTML = '';

      const formData = new FormData();
      if (problem) formData.append('problem', problem);
      if (imageUpload.files[0]) formData.append('image', imageUpload.files[0]);

      const response = await fetch('/api/solve', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      displaySolution(data);
      clearInputs();
      
    } catch (error) {
      console.error('Error:', error);
      solutionOutput.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    } finally {
      showLoading(false);
    }
  }

  function handleImageUpload() {
    if (imageUpload.files[0]) {
      const reader = new FileReader();
      reader.onload = function(e) {
        imagePreview.innerHTML = `<img src="${e.target.result}" class="uploaded-image">`;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(imageUpload.files[0]);
      problemInput.value = '';
    }
  }

  function displaySolution(data) {
    let solutionHTML = `
      <div class="original-problem">
        <strong>Problem:</strong> ${data.problem || 'Image-based problem'}
      </div>
      <hr>
      <div class="solution">${formatSolution(data.solution)}</div>
    `;
    solutionOutput.innerHTML = solutionHTML;

    if (window.MathJax) {
      MathJax.typesetPromise();
    }

    solutionOutput.scrollIntoView({ behavior: 'smooth' });
  }

  function clearInputs() {
    problemInput.value = '';
    imageUpload.value = '';
    imagePreview.innerHTML = '';
    imagePreview.style.display = 'none';
  }

  function formatSolution(solution) {
    // Convert to plain English first
    let cleanText = solution
      .replace(/\\boxed\{([^}]*)\}/g, '$1')
      .replace(/\\begin\{[^}]*\}/g, '')
      .replace(/\\end\{[^}]*\}/g, '')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\mathrm\{([^}]*)\}/g, '$1')
      .replace(/\\mathbf\{([^}]*)\}/g, '<strong>$1</strong>')
      .replace(/\\mathit\{([^}]*)\}/g, '<em>$1</em>')
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 divided by $2')
      .replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1')
      .replace(/\\sum_\{([^}]*)\}\^\{([^}]*)\}/g, 'sum from $1 to $2')
      .replace(/\\int_\{([^}]*)\}\^\{([^}]*)\}/g, 'integral from $1 to $2')
      .replace(/\\lim_\{([^}]*)\}/g, 'limit as $1')
      .replace(/\\to/g, '→')
      .replace(/\\infty/g, '∞')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\approx/g, '≈')
      .replace(/\\neq/g, '≠')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\cdot/g, '·')
      .replace(/\\ldots/g, '...')
      .replace(/\\cdots/g, '⋯')
      .replace(/\\vdots/g, '⋮')
      .replace(/\\ddots/g, '⋱')
      .replace(/\\left\(/g, '(')
      .replace(/\\right\)/g, ')')
      .replace(/\\left\[/g, '[')
      .replace(/\\right\]/g, ']')
      .replace(/\\left\\{/g, '{')
      .replace(/\\right\\}/g, '}')
      .replace(/\\left\|/g, '|')
      .replace(/\\right\|/g, '|')
      .replace(/\\,/g, ' ')
      .replace(/\\:/g, ' ')
      .replace(/\\;/g, ' ')
      .replace(/\\!/g, '')
      .replace(/\\ /g, ' ')
      .replace(/\\quad/g, '    ')
      .replace(/\\qquad/g, '        ')
      .replace(/\\hspace\{[^}]*\}/g, ' ')
      .replace(/\\vspace\{[^}]*\}/g, ' ')
      .replace(/\\smallskip/g, '\n\n')
      .replace(/\\medskip/g, '\n\n\n')
      .replace(/\\bigskip/g, '\n\n\n\n')
      .replace(/\\newline/g, '\n')
      .replace(/\\linebreak/g, '\n')
      .replace(/\\par/g, '\n\n')
      .replace(/\\noindent/g, '')
      .replace(/\\centering/g, '')
      .replace(/\\raggedright/g, '')
      .replace(/\\raggedleft/g, '')
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\ref\{[^}]*\}/g, '')
      .replace(/\\cite\{[^}]*\}/g, '')
      .replace(/\\footnote\{[^}]*\}/g, '')
      .replace(/\\caption\{[^}]*\}/g, '')
      .replace(/\\title\{[^}]*\}/g, '')
      .replace(/\\author\{[^}]*\}/g, '')
      .replace(/\\date\{[^}]*\}/g, '')
      .replace(/\\maketitle/g, '')
      .replace(/\\tableofcontents/g, '')
      .replace(/\\listoffigures/g, '')
      .replace(/\\listoftables/g, '')
      .replace(/\\bibliography\{[^}]*\}/g, '')
      .replace(/\\bibliographystyle\{[^}]*\}/g, '')
      .replace(/\\index\{[^}]*\}/g, '')
      .replace(/\\glossary\{[^}]*\}/g, '')
      .replace(/\\include\{[^}]*\}/g, '')
      .replace(/\\input\{[^}]*\}/g, '')
      .replace(/\\usepackage\{[^}]*\}/g, '')
      .replace(/\\documentclass\{[^}]*\}/g, '')
      .replace(/\\begin\{document\}/g, '')
      .replace(/\\end\{document\}/g, '')
      .replace(/\\[a-zA-Z]+/g, '') // Catch-all for remaining commands
      .replace(/\$\$([^$]+)\$\$/g, '$1') // Display math
      .replace(/\$([^$]+)\$/g, '$1') // Inline math
      .replace(/\\\[/g, '')
      .replace(/\\\]/g, '')
      .replace(/\\\(/g, '')
      .replace(/\\\)/g, '')
      .replace(/\{/g, '')
      .replace(/\}/g, '')
      .replace(/\\_/g, '_')
      .replace(/\\\^/g, '^')
      .replace(/\\~/g, '~')
      .replace(/\\&/g, '&')
      .replace(/\\%/g, '%')
      .replace(/\\#/g, '#')
      .replace(/\\\$/g, '$')
      .replace(/\\\{/g, '{')
      .replace(/\\\}/g, '}')
      .replace(/\\\|/g, '|')
      .replace(/\\</g, '<')
      .replace(/\\>/g, '>')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')');

    // Format logarithms properly
    cleanText = cleanText.replace(/\\log_([a-z0-9]+)\(([^)]+)\)/g, 
      '<span class="log-format"><span class="log-body">log</span><span class="log-base">$1</span>($2)</span>');

    // Format fractions visually
    cleanText = cleanText.replace(/([0-9.]+)\/([0-9.]+)/g, 
      '<span class="frac"><span class="numerator">$1</span><span class="denominator">$2</span></span>');

    // Format exponents
    cleanText = cleanText.replace(/([a-zA-Z0-9]+)\^([a-zA-Z0-9]+)/g, 
      '$1<sup>$2</sup>');

    // Clean up multiple spaces and newlines
    cleanText = cleanText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    return cleanText;
  }

  function showLoading(show) {
    loader.style.display = show ? 'block' : 'none';
    solveBtn.disabled = show;
  }
});lock' : 'none';
    solveBtn.disabled = show;
  }
});
