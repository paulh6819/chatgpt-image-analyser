import express from "express";
import multer from "multer";
import OpenAI from "openai";
import "dotenv/config";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.urlencoded({ extended: true }));
app.use(cors());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const openai = new OpenAI({
  apiKey: process.env.CHAT_GPT_API_KEY,
});

// Database connection settings from Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const dvdModeToggleSwitch = true;

app.post("/AIAnalysisEndPoint", upload.array("images"), async (req, res) => {
  //this is the default test GPTapiMode
  if (!dvdModeToggleSwitch) {
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
  }

  if (dvdModeToggleSwitch) {
    console.log("DVD mode is enabled! Querying database...");

    //this is necessary because the prompt comes in array of all the promts, can be a source for bugs so I will need to dig in to this
    const promptTextArray = req.body.prompt;
    let promtForGPT = extractPrompt(promptTextArray);
    console.log("this is the first console.log", promtForGPT);

    if (!req.files || req.files.length === 0) {
      return res.status(400).send("No images uploaded.");
    }

    const promises = req.files.map(async (file) => {
      try {
        const gptResult = await informationBackFromChatGPTAboutPhoto(
          file.buffer,
          promtForGPT
        );
        const rawContent = gptResult.message.content; // Get the JSON string
        const titlesInJSONFromChatGPT = JSON.parse(rawContent); // Parse it into an object
        const titlesInPlainEnglishFormat = titlesInJSONFromChatGPT.titles.map(
          (title) => title
        );

        console.log(
          "These are the extracted titles:",
          titlesInPlainEnglishFormat
        );

        // Run PostgreSQL fuzzy logic for each title and collect results
        const fuzzyLogicPromises = titlesInPlainEnglishFormat.map((title) =>
          useFuzzyLogicToSearchRailWaysDatabaseForMatch(title)
        );

        const fuzzyResults = await Promise.all(fuzzyLogicPromises);

        return {
          extractedTitles: titlesInPlainEnglishFormat,
          fuzzyMatches: fuzzyResults,
        };
      } catch (error) {
        console.error("Error processing image:", error);
        return { error: "Failed to process image." };
      }
    });
    Promise.allSettled(promises).then((results) => {
      const successfulResults = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      // console.log("Final result going to UI:", successfulResults);
      console.log(
        "Final result going to UI:",
        JSON.stringify(successfulResults, null, 2)
      );

      res.json({ results: successfulResults });

      console.log("this is the successful results", successfulResults);
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

//helper functions

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
            text: ` ${prompt}`,
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

async function useFuzzyLogicToSearchRailWaysDatabaseForMatch(title) {
  let returnedMostLikelyTitle = null;
  let returnedPriceOfLikelyTitle = null;
  let valueGoingToTheUI = `No close matches found for: ${title}`;
  let likelyMatches = [];

  try {
    const result = await pool.query(
      `SELECT title, price
       FROM dvds
       WHERE similarity(title, $1) > 0.4
       ORDER BY similarity(title, $1) DESC
       LIMIT 3`,
      [title] // Pass the user-provided title safely
    );

    if (result.rows.length > 0) {
      likelyMatches = result.rows.map((row) => ({
        title: row.title,
        price: row.price,
      }));

      console.log(`For title "${title}", top matches:`, likelyMatches);
      valueGoingToTheUI = `For title "${title}", top matches:, ${likelyMatches}`;

      // Convert the array of matches into a readable string for the UI
      valueGoingToTheUI =
        `For title "${title}", top matches:\n` +
        likelyMatches
          .map(
            (match, index) =>
              `${index + 1}. ${match.title} (Price: ${match.price})`
          )
          .join("\n"); // This properly formats the array into a string

      console.log("this is the value going to the UI", valueGoingToTheUI);
    } else {
      console.log("No close matches found for:", title);
    }
  } catch (error) {
    console.error("Database query failed:", error);
  }

  return valueGoingToTheUI;
}
