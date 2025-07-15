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
    return solution
      // Convert symbols first
      .replace(/\*/g, '×')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      // Clean LaTeX artifacts
      .replace(/\\begin\{.*?\}/g, '')
      .replace(/\\end\{.*?\}/g, '')
      .replace(/\\quad/g, ' ')
      .replace(/\\text\{/g, '')
      .replace(/\}/g, '')
      // Preserve LaTeX math blocks
      .replace(/\$\$(.*?)\$\$/g, '<div class="math-display">$$$1$$</div>')
      .replace(/\$(.*?)\$/g, '<span class="math-inline">$1</span>')
      // Format boxed answers
      .replace(/\\boxed{(.*?)}/g, '<div class="answer-box">$1</div>')
      // Handle line breaks
      .replace(/\n/g, '<br>');
  }

  function showLoading(show) {
    loader.style.display = show ? 'block' : 'none';
    solveBtn.disabled = show;
  }
});
