document.addEventListener('DOMContentLoaded', () => {
  const problemInput = document.getElementById('problemInput');
  const imageUpload = document.getElementById('imageUpload');
  const solveBtn = document.getElementById('solveBtn');
  const solutionOutput = document.getElementById('solutionOutput');
  const loader = document.getElementById('loader');
  const imagePreview = document.getElementById('imagePreview'); // Add this element in your HTML

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
      
      // Clear inputs after successful solution
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
      // Display image preview
      const reader = new FileReader();
      reader.onload = function(e) {
        imagePreview.innerHTML = `<img src="${e.target.result}" class="uploaded-image">`;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(imageUpload.files[0]);
      
      // Clear problem input if image is uploaded
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
    // Clear text input
    problemInput.value = '';
    
    // Clear file input and preview
    imageUpload.value = '';
    imagePreview.innerHTML = '';
    imagePreview.style.display = 'none';
  }

  function formatSolution(solution) {
    // helper to convert digits and symbols to superscript
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

    // First pass: Clean LaTeX artifacts
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

    // Enhanced logarithm formatting
    cleanSolution = cleanSolution
      .replace(/\\log_(\d+|\\?[a-z])\(([^)]+)\)/g, 
        '<span class="log-format"><span class="log-body">log</span><span class="log-base">$1</span>($2)</span>')
      .replace(/\\log\(([^)]+)\)/g, 'log($1)');

    // Enhanced fraction formatting
    cleanSolution = cleanSolution
      .replace(/([^\\])\\frac\{([^}]+)\}\{([^}]+)\}/g, 
        '<span class="frac"><span class="numerator">$2</span><span class="denominator">$3</span></span>');

    // Second pass: Apply other formatting
    return cleanSolution
      .replace(/([a-zA-Z0-9])\^2\b/g, '$1²')
      .replace(/([a-zA-Z0-9])\^3\b/g, '$1³')
      .replace(/([a-zA-Z0-9])\^([a-zA-Z])/g, (_, base, exp) => base + toSuperscript(exp))
      .replace(/([a-zA-Z0-9])\^\(([^)]+)\)/g, (_, base, exp) => base + toSuperscript(exp))
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
});
