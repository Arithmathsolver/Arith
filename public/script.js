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

    // Render MathJax for any LaTeX in the solution
    if (window.MathJax) {
      MathJax.typesetPromise();
    }

    // Scroll to solution output
    solutionOutput.scrollIntoView({ behavior: 'smooth' });
  }

  function formatSolution(solution) {
    if (!solution) return '';

    return solution
      // Boxed answers to MathJax compatible
      .replace(/\\boxed{(.*?)}/g, '\\fbox{$1}')
      // Convert fractions
      .replace(/\\frac{(.*?)}{(.*?)}/g, '\\frac{$1}{$2}')
      // Handle align environments
      .replace(/\\begin{align}(.*?)\\end{align}/gs, '\$1 \')
      // Chemical formulas with mhchem package
      .replace(/\\ce{(.*?)}/g, '\\ce{$1}')
      // Operators
      .replace(/\*/g, '×')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\log\b/g, 'log')
      // Remove stray backslashes
      .replace(/\
