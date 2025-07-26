
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from PIL import Image
import sys

# Load TrOCR model (handwritten is better for math and notes)
processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")

image_path = sys.argv[1]
image = Image.open(image_path).convert("RGB")

pixel_values = processor(images=image, return_tensors="pt").pixel_values
generated_ids = model.generate(pixel_values)
predicted_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

print(predicted_text)
