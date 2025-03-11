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

// const dvdModeToggleSwitch = true;

app.post("/AIAnalysisEndPoint", upload.array("images"), async (req, res) => {
  const queryType = req.query.media;

  console.log("this is the query type", queryType);

  //this needs to be refactored for anything thats dealing with DVD extraciton
  try {
    if (queryType === "DVD") {
      console.log("DVD mode is enabled! Querying database...");

      //this is necessary because the prompt comes in array of all the promts, can be a source for bugs so I will need to dig in to this
      const promptTextArray = req.body.prompt;
      let promtForGPT = extractPrompt(promptTextArray);
      console.log("this is the first console.log", promtForGPT);

      if (!req.files || req.files.length === 0) {
        return res.status(400).send("No images uploaded.");
      }
      let imageTOReturnToFrontEnd;
      const promises = req.files.map(async (file) => {
        imageTOReturnToFrontEnd = file.buffer;
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
            useFuzzyLogicToSearchRailWaysDatabaseForMatch_DVD(title)
          );

          const fuzzyResults = await Promise.all(fuzzyLogicPromises);

          console.log("this is the fuzzy logic", fuzzyResults);

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

        res.json({
          results: successfulResults,
          imageKey: imageTOReturnToFrontEnd,
        });

        console.log("this is the successful results", successfulResults);
      });
    } else if (queryType === "VHS") {
      runTheVHSLogic(req, res);

      // //this is where the logic for vhs query's go
      // console.log("vhs mode is enabled! Querying database...");

      // //this is necessary because the prompt comes in array of all the promts, can be a source for bugs so I will need to dig in to this
      // const promptTextArray = req.body.prompt;
      // let promtForGPT = extractPrompt(promptTextArray);
      // console.log("this is the first console.log", promtForGPT);

      // if (!req.files || req.files.length === 0) {
      //   return res.status(400).send("No images uploaded.");
      // }

      // const promises = req.files.map(async (file) => {
      //   try {
      //     const gptResult = await informationBackFromChatGPTAboutPhoto(
      //       file.buffer,
      //       promtForGPT
      //     );
      //     const rawContent = gptResult.message.content; // Get the JSON string
      //     const titlesInJSONFromChatGPT = JSON.parse(rawContent); // Parse it into an object
      //     const titlesInPlainEnglishFormat = titlesInJSONFromChatGPT.titles.map(
      //       (title) => title
      //     );

      //     console.log(
      //       "These are the extracted titles:",
      //       titlesInPlainEnglishFormat
      //     );

      //     // Run PostgreSQL fuzzy logic for each title and collect results
      //     const fuzzyLogicPromises = titlesInPlainEnglishFormat.map((title) =>
      //       useFuzzyLogicToSearchRailWaysDatabaseForMatch_VHS(title)
      //     );

      //     const fuzzyResults = await Promise.all(fuzzyLogicPromises);

      //     return {
      //       extractedTitles: titlesInPlainEnglishFormat,
      //       fuzzyMatches: fuzzyResults,
      //     };
      //   } catch (error) {
      //     console.error("Error processing image:", error);
      //     return { error: "Failed to process image." };
      //   }
      // });
      // Promise.allSettled(promises).then((results) => {
      //   const successfulResults = results
      //     .filter((result) => result.status === "fulfilled")
      //     .map((result) => result.value);

      //   // console.log("Final result going to UI:", successfulResults);
      //   console.log(
      //     "Final resultof vhs going to UI:",
      //     JSON.stringify(successfulResults, null, 2)
      //   );

      //   res.json({ results: successfulResults });

      //   console.log("this is the successful results", successfulResults);
      // });
    } else {
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
  } catch (error) {
    console.log(
      "this is a try catch error, hasnt even entered the queary type if statements:",
      error
    );
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

async function useFuzzyLogicToSearchRailWaysDatabaseForMatch_DVD(title) {
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

      // console.log(
      //   `For title (duplicate) "${title}", top matches:`,
      //   likelyMatches
      // );
      // console.log(
      //   "\n",
      //   `testing first  top matche title fixing:`,
      //   removeDuplicateTitle(likelyMatches[0].title)
      // );
      console.log(
        "\n",
        `testing first  top matche WITHOUT the fixing:`,
        likelyMatches[0].title
      );

      //valueGoingToTheUI = `For title "${title}",--------> top matches:, ${likelyMatches}`;

      // Clean up all titles in likelyMatches BEFORE using them in .map()
      likelyMatches.forEach((match) => {
        match.title = removeDuplicateTitle(match.title);
      });

      console.log(
        "her is the second title to remove",
        removeDuplicateTitle(likelyMatches[1].title)
      );

      // Convert the cleaned array of matches into a readable string for the UI
      valueGoingToTheUI = `
      <div class="match-container">
        <p ><strong >For title:</strong>  <span class = "title-in-match-container">"${title}"</span>, top matches:</p>
        <ul class="match-list">
            ${likelyMatches
              .map(
                (match, index) =>
                  `<li class="match-item">
                      <strong>${index + 1}. ${match.title}</strong> 
                      <span class="price">(Price: ${match.price})</span>
                   </li>`
              )
              .join("")}
        </ul>
    </div>`;

      console.log("✅ Cleaned Titles Sent to UI:\n", valueGoingToTheUI);
    } else {
      console.log("No close matches found for:", title);
    }
  } catch (error) {
    console.error("Database query failed:", error);
  }

  return valueGoingToTheUI;
}

async function useFuzzyLogicToSearchRailWaysDatabaseForMatch_VHS(title) {
  let returnedMostLikelyTitle = null;
  let returnedPriceOfLikelyTitle = null;
  let valueGoingToTheUI = `No close matches found for: ${title}`;
  let likelyMatches = [];

  try {
    const result = await pool.query(
      `SELECT title, price
       FROM vhs_tapes
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

      // Convert the cleaned array of matches into a readable string for the UI
      valueGoingToTheUI = `
   <div class="match-container">
     <p ><strong >For title:</strong>  <span class = "title-in-match-container">"${title}"</span>, top matches:</p>
     <ul class="match-list">
         ${likelyMatches
           .map(
             (match, index) =>
               `<li class="match-item">
                   <strong>${index + 1}. ${match.title}</strong> 
                   <span class="price">(Price: ${match.price})</span>
                </li>`
           )
           .join("")}
     </ul>
 </div>`;

      console.log("this is the value going to the UI", valueGoingToTheUI);
    } else {
      console.log("No close matches found for:", title);
    }
  } catch (error) {
    console.error("Database query failed:", error);
  }

  return valueGoingToTheUI;
}
function removeDuplicateTitle(title) {
  const words = title.split(" ");
  const mid = Math.floor(words.length / 2);

  if (words.slice(0, mid).join(" ") === words.slice(mid).join(" ")) {
    return words.slice(0, mid).join(" ");
  }

  if (!title) return ""; // Handle empty values safely

  // Find the longest repeated sequence of words in the title
  const match = title.match(/^(.*?)\1+$/);

  if (match) {
    return match[1].trim(); // Return only the first occurrence of the repeated text
  }

  return title; // If no duplication detected, return as-is
}
function runTheVHSLogic(req, res) {
  console.log("VHS mode is enabled! Querying database...");

  const promptTextArray = req.body.prompt;
  let promtForGPT = extractPrompt(promptTextArray);
  console.log("Prompt for VHS:", promtForGPT);

  if (!req.files || req.files.length === 0) {
    return res.status(400).send("No images uploaded.");
  }

  let imageTOReturnToFrontEnd;

  const promises = req.files.map(async (file) => {
    imageTOReturnToFrontEnd = file.buffer; // <-- attach one image (or could return multiple if you modify structure)

    try {
      const gptResult = await informationBackFromChatGPTAboutPhoto(
        file.buffer,
        promtForGPT
      );

      const rawContent = gptResult.message.content;
      const titlesInJSONFromChatGPT = JSON.parse(rawContent);
      const titlesInPlainEnglishFormat = titlesInJSONFromChatGPT.titles.map(
        (title) => title
      );

      console.log("Extracted VHS Titles:", titlesInPlainEnglishFormat);

      const fuzzyLogicPromises = titlesInPlainEnglishFormat.map((title) =>
        useFuzzyLogicToSearchRailWaysDatabaseForMatch_VHS(title)
      );

      const fuzzyResults = await Promise.all(fuzzyLogicPromises);

      return {
        extractedTitles: titlesInPlainEnglishFormat,
        fuzzyMatches: fuzzyResults,
      };
    } catch (error) {
      console.error("Error processing VHS image:", error);
      return { error: "Failed to process VHS image." };
    }
  });

  Promise.allSettled(promises).then((results) => {
    const successfulResults = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    console.log(
      "Final VHS result going to UI:",
      JSON.stringify(successfulResults, null, 2)
    );

    res.json({
      results: successfulResults,
      imageKey: imageTOReturnToFrontEnd,
    });

    console.log("this is the successful VHS results", successfulResults);
  });
}
