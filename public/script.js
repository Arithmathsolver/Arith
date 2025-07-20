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
    let problem = problemInput.value.trim();

    if (!problem && !imageUpload.files[0]) {
      alert('Please enter a problem or upload an image');
      return;
    }

    try {
      showLoading(true);
      solutionOutput.innerHTML = '';

      const formData = new FormData();

      if (problem) {
        const cleanedProblem = formatSolution(problem);
        formData.append('problem', cleanedProblem);
      }

      if (imageUpload.files[0]) {
        formData.append('image', imageUpload.files[0]);
      }

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
      previewOCR(imageUpload.files[0]);
      problemInput.value = '';
    }
  }

  async function previewOCR(imageFile) {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const response = await fetch('/api/ocr-preview', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();

      let corrected = data.corrected || '';
      corrected = corrected.replace(/^Here is the corrected text:\s*/i, '');
      problemInput.value = corrected.trim();
      solveBtn.click();

    } catch (err) {
      console.error('OCR Preview Error:', err);
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
    solutionOutput.innerHTML += solutionHTML;
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
    function toSuperscript(text) {
      const superscriptMap = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
        'n': 'ⁿ', 'i': 'ⁱ'
      };
      return text.split('').map(c => superscriptMap[c] || c).join('');
    }

    function toSubscript(text) {
      const subscriptMap = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
        '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
        'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
        'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
        'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
        'v': 'ᵥ', 'x': 'ₓ'
      };
      return text.split('').map(c => subscriptMap[c] || c).join('');
    }

    function recursiveFrac(text) {
      return text.replace(/\\frac\s*{([^{}]+)}{([^{}]+)}/g, (_, num, den) => {
        return `(${recursiveFrac(num)} / ${recursiveFrac(den)})`;
      });
    }

    let clean = solution
      .replace(/\\begin\{cases\}(.+?)\\end\{cases\}/gs, (_, block) =>
        block.replace(/\\\\/g, '<br>').replace(/&/g, ' : ')
      )
      .replace(/\\text\s*{([^}]+)}/g, '$1')
      .replace(/\\begin\{.*?\}/g, '')
      .replace(/\\end\{.*?\}/g, '')
      .replace(/\\\\/g, '<br>')
      .replace(/\$\$/g, '')
      .replace(/\$(.*?)\$/g, '$1')
      .replace(/\\hat\s*{([^}]+)}/g, '$1̂')
      .replace(/\\bar\s*{([^}]+)}/g, '$1̄')
      .replace(/\\vec\s*{([^}]+)}/g, '→$1')
      .replace(/\\overline\s*{([^}]+)}/g, '$1̅')
      .replace(/\\underline\s*{([^}]+)}/g, '_$1_')
      .replace(/\\frac\s*{([^{}]+)}{([^{}]+)}/g, (_, a, b) => `(${a} / ${b})`)
      .replace(/\\sqrt\s*\[([^\]]+)\]{([^}]+)}/g, '$1√$2')
      .replace(/\\sqrt\s*{([^}]+)}/g, '√$1')
      .replace(/\\log\s*_{([^}]+)}\s*{([^}]+)}/g, 'log_$1($2)')
      .replace(/\\log\s*{([^}]+)}/g, 'log($1)')
      .replace(/\\lim_{([^}]+)}/g, 'lim ($1)')
      .replace(/\\sum_{([^}]+)}\^({([^}]+)}|(\w))/g, 'Sum from $1 to $3$4')
      .replace(/\\int_{([^}]+)}\^{([^}]+)}/g, 'Integral from $1 to $2')
      .replace(/\\partial/g, '∂')
      .replace(/\\nabla/g, '∇')
      .replace(/\\infty/g, '∞')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\omega/g, 'ω')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\Sigma/g, 'Σ')
      .replace(/\\geq/g, '≥')
      .replace(/\\leq/g, '≤')
      .replace(/\\neq/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\cdot/g, '·')
      .replace(/\\pm/g, '±')
      .replace(/\\forall/g, 'for all')
      .replace(/\\slash/g, '/')
      .replace(/\\_/g, '_')
      .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
      .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
      .replace(/\\left\{/g, '{').replace(/\\right\}/g, '}')
      .replace(/\\sin\s*{([^}]+)}/g, 'sin($1)')
      .replace(/\\cos\s*{([^}]+)}/g, 'cos($1)')
      .replace(/\\tan\s*{([^}]+)}/g, 'tan($1)')
      .replace(/\\csc\s*{([^}]+)}/g, 'csc($1)')
      .replace(/\\sec\s*{([^}]+)}/g, 'sec($1)')
      .replace(/\\cot\s*{([^}]+)}/g, 'cot($1)')
      .replace(/\\([a-zA-Z])/g, '$1')
      .replace(/\*/g, '×')
      .replace(/\n/g, '<br>')
      .replace(/ +/g, ' ')
      .replace(/\\+/g, '')
      .trim();

    clean = recursiveFrac(clean);

    clean = clean
      .replace(/(\S)\^\{([^}]+)\}/g, (_, base, exp) => base + toSuperscript(exp))
      .replace(/(\S)\^(\S)/g, (_, base, exp) => base + toSuperscript(exp))
      .replace(/(\S)_\{([^}]+)\}/g, (_, base, sub) => base + toSubscript(sub))
      .replace(/(\S)_(\S)/g, (_, base, sub) => base + toSubscript(sub));

    return clean;
  }

  function showLoading(show) {
    loader.style.display = show ? 'block' : 'none';
    solveBtn.disabled = show;
  }
});
