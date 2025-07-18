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
      const reader = new FileReader();
      reader.onload = function(e) {
        imagePreview.innerHTML = `<img src="${e.target.result}" class="uploaded-image">`;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(imageUpload.files[0]);
      problemInput.value = '';
    }
    solveBtn.click();
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
    function toSuperscript(text) {
      const superscriptMap = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
        'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
        'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
        'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
        'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ'
      };
      return text.split('').map(c => superscriptMap[c] || c).join('');
    }

    function toSubscript(text) {
      const subscriptMap = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
        'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
        'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
        'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
        'v': 'ᵥ', 'x': 'ₓ'
      };
      return text.split('').map(c => subscriptMap[c] || c).join('');
    }

    let cleanSolution = solution
      .replace(/\\begin\{.*?\}/g, '')
      .replace(/\\end\{.*?\}/g, '')
      .replace(/\\\\/g, ' ')
      .replace(/\\,/g, ' ')
      .replace(/\\!/g, '')
      .replace(/\\;/g, ' ')
      .replace(/\\:/g, ' ')
      .replace(/\\quad/g, ' ')
      .replace(/\\qquad/g, ' ')
      .replace(/\\ /g, ' ')
      .replace(/\$\$/g, '')
      .replace(/\$(.*?)\$/g, '$1')
      .replace(/\\boxed\{([^}]*)\}/g, '$1')
      .replace(/\bboxed\{([^}]*)\}/g, '$1')
      .replace(/boxed|oxed/gi, '')

      .replace(/\\frac\s*{([^}]+)}{([^}]+)}/g, '($1 / $2)')
      .replace(/\bfrac\s*{([^}]+)}{([^}]+)}/g, '($1 / $2)')
      .replace(/\\sqrt\s*{([^}]+)}/g, '√$1')
      .replace(/\bsqrt\s*{([^}]+)}/g, '√$1')
      .replace(/\\sqrt\s*\[([^\]]+)\]{([^}]+)}/g, '$1√$2')

      .replace(/\\log\s*{([^}]+)}/g, 'log($1)')
      .replace(/\blog\s*{([^}]+)}/g, 'log($1)')

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

      .replace(/\\sum_{([^}]+)}\^({([^}]+)}|(\w))/g, 'Sum $1 to $3$4')
      .replace(/\\int_{([^}]+)}\^{([^}]+)}/g, 'Integral from $1 to $2')
      .replace(/\\partial/g, '∂')
      .replace(/\\nabla/g, '∇')
      .replace(/\\infty/g, '∞')

      .replace(/\\left\|([^|]+)\\right\|/g, '|$1|')
      .replace(/\\lfloor\s*(.*?)\s*\\rfloor/g, '⌊$1⌋')
      .replace(/\\lceil\s*(.*?)\s*\\rceil/g, '⌈$1⌉')

      .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
      .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
      .replace(/\\left\{/g, '{').replace(/\\right\}/g, '}')

      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\cdot/g, '*')
      .replace(/\\pm/g, '±')
      .replace(/\\forall/g, 'for all')
      .replace(/\\slash/g, '/')
      .replace(/\\_/g, '_')

      .replace(/\\([0-9a-zA-Z])/g, '$1')
      .replace(/\*/g, '×')
      .replace(/\n/g, '<br>')
      .replace(/ +/g, ' ')
      .replace(/\\+/g, '') // removes remaining slashes
      .trim();

    cleanSolution = cleanSolution
      .replace(/([a-zA-Z0-9])\^2\b/g, '$1²')
      .replace(/([a-zA-Z0-9])\^3\b/g, '$1³')
      .replace(/([a-zA-Z0-9])\^([a-zA-Z0-9]+)/g, (_, base, exp) => base + toSuperscript(exp))
      .replace(/_([a-zA-Z0-9]+)/g, (_, sub) => toSubscript(sub))
      .replace(/_([0-9]+)\(([^)]+)\)/g, (_, base, arg) => `log<sub>${base}</sub>(${arg})`);

    return cleanSolution;
  }

  function showLoading(show) {
    loader.style.display = show ? 'block' : 'none';
    solveBtn.disabled = show;
  }
});
