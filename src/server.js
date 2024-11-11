import express from "express";
import multer from "multer";
import OpenAI from "openai";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.urlencoded({ extended: true }));
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const openai = new OpenAI({
  apiKey: process.env.CHAT_GPT_API_KEY,
});

app.post("/AIAnalysisEndPoint", upload.array("images"), async (req, res) => {
  //this is necessary because the prompt comes in array of all the promts, can be a source for bugs so I will need to dig in to this
  const promptTextArray = req.body.prompt;
  let promtForGPT = extractPrompt(promptTextArray);
  console.log("this is the first console.log", promtForGPT);

  if (!req.files || req.files.length === 0) {
    return res.status(400).send("No images uploaded.");
  }

  const promises = req.files.map((file) =>
    informationBackFromChatGPTAboutPhoto(file.buffer, promtForGPT)
  );

  Promise.allSettled(promises).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        console.log(`Image ${index + 1}: Success`, result.value);
      } else {
        console.log(`Image ${index + 1}: Failed`, result.reason);
      }
    });
    // Filter out successful responses and send them back to the client
    const successfulResults = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    res.json(successfulResults);
    console.log("this is the successful results", successfulResults);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function informationBackFromChatGPTAboutPhoto(img, prompt) {
  const base64Image = Buffer.from(img).toString("base64");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Here is a promt from a user in regards to the image: ${prompt}. Answer as best you can, and format the response in HTML with proper headings, paragraphs, and spaces at the bottom for additional responses. Make sure it’s readable and well-structured. Do not provide a html tag or a body tag or block markers. 
`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
  });
  console.log(
    "here is chat GPTs response to the INITAL book image",
    response.choices[0]
  );

  return response.choices[0];
}

function extractPrompt(itemToTest) {
  if (Array.isArray(itemToTest)) {
    return itemToTest[itemToTest.length - 1];
  } else {
    return itemToTest;
  }
}
