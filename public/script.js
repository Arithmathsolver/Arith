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
      solveBtn.click(); // Auto-submit on image upload
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
    return solution
      // Powers formatting: convert ^ to LaTeX superscript
      .replace(/([a-zA-Z0-9])\^\(([^)]+)\)/g, '$1^{\$2}')
      .replace(/([a-zA-Z0-9])\^([a-zA-Z0-9])/g, '$1^{\$2}')
      // Clean raw LaTeX commands
      .replace(/\\log\b/g, 'log')
      .replace(/\\boxed{(.*?)}/g, '<div class="answer-box">$1</div>')
      // Fix negative signs
      .replace(/_{-/g, '_{')
      // Convert operators
      .replace(/\*/g, '×')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      // Handle math blocks
      .replace(/\$\$(.*?)\$\$/g, '<div class="math-display">$$$1$$</div>')
      .replace(/\$(.*?)\$/g, '<span class="math-inline">$1</span>')
      // Remove standalone backslashes not followed by _
      .replace(/\\(?=[^_])/g, '')
      .replace(/\\_/g, '_')
      .replace(/\n/g, '<br>');
  }

  function showLoading(show) {
    loader.style.display = show ? 'block' : 'none';
    solveBtn.disabled = show;
  }
});
