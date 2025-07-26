from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from PIL import Image
import sys

# Load TrOCR model
processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")

# Get the image path from command line argument
image_path = sys.argv[1]
image = Image.open(image_path).convert("RGB")

# OCR with TrOCR
pixel_values = processor(images=image, return_tensors="pt").pixel_values
generated_ids = model.generate(pixel_values)
predicted_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

# Output the extracted text
print(predicted_text)
