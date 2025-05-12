document.getElementById("solve-btn").addEventListener("click", async () => {
    const input = document.getElementById("math-input").value;
    const resultDiv = document.getElementById("result");
    const stepsDiv = document.getElementById("steps");

    resultDiv.textContent = "Solving...";
    stepsDiv.textContent = "";

    const response = await fetch("http://localhost:3000/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: input }),
    });

    const data = await response.json();

    const [firstLine, ...rest] = data.solution.split('\n');
    resultDiv.textContent = firstLine;
    stepsDiv.textContent = rest.join('\n');
});

document.getElementById("image-input").addEventListener("change", async function () {
    const file = this.files[0];
    if (!file) return;

    const resultDiv = document.getElementById("result");
    const stepsDiv = document.getElementById("steps");

    const formData = new FormData();
    formData.append("image", file);

    resultDiv.textContent = "Processing image...";
    stepsDiv.textContent = "";

    const response = await fetch("http://localhost:3000/solve-image", {
        method: "POST",
        body: formData,
    });

    const data = await response.json();

    const [firstLine, ...rest] = data.solution.split('\n');
    resultDiv.textContent = firstLine;
    stepsDiv.textContent = rest.join('\n');
});
