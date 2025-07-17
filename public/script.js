document.addEventListener('DOMContentLoaded', () => {
  const problemInput = document.getElementById('problemInput');
  const imageUpload = document.getElementById('imageUpload');
  const solveBtn = document.getElementById('solveBtn');
  const solutionOutput = document.getElementById('solutionOutput');
  const loader = document.getElementById('loader');

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
      clearInputs(); // clear after displaying solution
    } catch (error) {
      console.error('Error:', error);
      solutionOutput.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    } finally {
      showLoading(false);
    }
  }

  function handleImageUpload() {
    if (imageUpload.files[0]) {
      problemInput.value = '';
      solveBtn.click();
    }
  }

  function displaySolution(data) {
    let solutionHTML = `
      <div class="original-problem">
        <strong>Problem:</strong> ${data.problem}
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

  function formatSolution(solution) {
    function toSuperscript(text) {
      const superscriptMap = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
        'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ᶦ', 'j': 'ʲ',
        'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
        'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
        'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
        '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾'
      };
      return text.split('').map(c => superscriptMap[c] || c).join('');
    }

    let cleanSolution = solution
      .replace(/\\boxed\{([^}]*)\}/g, '$1')
      .replace(/\\begin\{[^}]+\}/g, '')
      .replace(/\\end\{[^}]+\}/g, '')
      .replace(/\\align/g, '')
      .replace(/\\,/g, ' ')
      .replace(/\\approx/g, '≈')
      .replace(/\\forall/g, 'for all')
      .replace(/\\neq/g, '≠')
      .replace(/\\left/g, '')
      .replace(/\\right/g, '')
      .replace(/\\([^_])/g, '$1')
      .replace(/\\_/g, '_')
      .replace(/\$\$/g, '')
      .replace(/\\\[/g, '')
      .replace(/\\\]/g, '')
      .replace(/\{/g, '')
      .replace(/\}/g, '')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')');

    return cleanSolution
      .replace(/([a-zA-Z0-9])\^2\b/g, '$1²')
      .replace(/([a-zA-Z0-9])\^3\b/g, '$1³')
      .replace(/([a-zA-Z0-9])\^([a-zA-Z])/g, (_, base, exp) => base + toSuperscript(exp))
      .replace(/([a-zA-Z0-9])\^\(([^)]+)\)/g, (_, base, exp) => base + toSuperscript(exp))
      .replace(/\\log_(\d+)/g, 'log<sub>$1</sub>')
      .replace(/\\log_([a-z])/g, 'log<sub>$1</sub>')
      .replace(/\\log\b/g, 'log')
      .replace(/_{-/g, '_{')
      .replace(/\*/g, '×')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\n/g, '<br>');
  }

  function showLoading(show) {
    loader.style.display = show ? 'block' : 'none';
    solveBtn.disabled = show;
  }

  function clearInputs() {
    problemInput.value = '';
    imageUpload.value = '';
  }
});
