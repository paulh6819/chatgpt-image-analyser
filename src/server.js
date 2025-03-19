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
            useFuzzyLogicToSearchRailWaysDatabaseForMatch_DVD(title, req)
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
      7;
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
    } else if (queryType === "CASSETTE") {
      runTheCassetteLogic(req, res);
    } else if (queryType === "CD") {
      runTheCDLogic(req, res);
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

async function useFuzzyLogicToSearchRailWaysDatabaseForMatch_DVD(title, req) {
  console.log("fuzzyLogicSearchStrenth", req.query.fuzzyLogicSearchStrenth);
  const fuzzyLogicStrength = req.query.fuzzyLogicSearchStrenth;
  let returnedMostLikelyTitle = null;
  let returnedPriceOfLikelyTitle = null;
  let valueGoingToTheUI = `No close matches found for: ${title}`;
  let likelyMatches = [];

  try {
    const result = await pool.query(
      `SELECT title, price
       FROM dvds
       WHERE similarity(title, $1) > 0.${fuzzyLogicStrength}
       ORDER BY similarity(title, $1) DESC
       LIMIT 3`,
      [title] // Pass the user-provided title safely
    );

    if (result.rows.length > 0) {
      likelyMatches = result.rows.map((row) => ({
        title: row.title,
        price: row.price,
      }));
      const summaryForChatGpt = createReadableMatchSummaryForChatGPT(
        title,
        likelyMatches
      );
      console.log("here is the chatGPT summary", summaryForChatGpt);

      console.log(`For title "${title}", top matches:`, likelyMatches);
      // valueGoingToTheUI = `For title "${title}", top matches:, ${likelyMatches}`;
      let turnBoxGreenBecauseChatGPTThinksThereIsAMatch;
      // console.log("this is the value going to the UI", valueGoingToTheUI);
      const promptForAskingAboutPotentialMatch = `The following is a fuzzy logic search of a database of VHS titles. Your Job is determine if these
            // possible matches are indeed likely real life matches. Respond with "true" if any of them are, respond with "false" if these fuzzy logic matches
            // are a false positive. Erorr on the side of caution towards it being a match.  No other words of explantion are wanted - ${summaryForChatGpt}
            // `;
      console.log(
        "this is the toggle switch off the req-",
        req.query.extraAnalysis
      );

      console.log(
        "\n",
        `testing first  top matche WITHOUT the fixing:`,
        likelyMatches[0].title
      );

      // Clean up all titles in likelyMatches BEFORE using them in .map()
      likelyMatches.forEach((match) => {
        match.title = removeDuplicateTitle(match.title);
      });

      console.log(
        "her is the second title to remove",
        removeDuplicateTitle(likelyMatches[1].title)
      );

      //new extra analysis logic here---> below
      if (req.query.extraAnalysis === "true") {
        console.log(
          "this is insidee the extraAnalysis if then",
          promptForAskingAboutPotentialMatch
        );
        // Wrap the logic in an async IIFE to ensure await works correctly
        const matchResult = await askChatGPTIfMatchIsReal(
          promptForAskingAboutPotentialMatch
        );
        console.log("Match result from GPT:", matchResult);
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch = matchResult
          .toString()
          .trim()
          .toLowerCase();
      }

      // Convert the cleaned array of matches into a readable string for the UI
      let colorForBackgroudOfDiv = "pink";
      console.log(
        "this is chatGPTs resopnse right before the turn green if then ",
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch
      );
      if (
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch === "true" ||
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch === "True"
      ) {
        console.log("checking color", colorForBackgroudOfDiv);
        colorForBackgroudOfDiv = "lightgreen";
      }

      // Convert the cleaned array of matches into a readable string for the UI
      valueGoingToTheUI = `
      <div class="match-container" style="background-color:${colorForBackgroudOfDiv}">
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

async function useFuzzyLogicToSearchRailWaysDatabaseForMatch_VHS(
  title,
  img,
  req
) {
  let returnedMostLikelyTitle = null;
  let returnedPriceOfLikelyTitle = null;
  let valueGoingToTheUI = `No close matches found for: ${title}`;
  let likelyMatches = [];

  try {
    const result = await pool.query(
      `SELECT title, price
       FROM vhs_tapes
       WHERE similarity(title, $1) > 0.3
       ORDER BY similarity(title, $1) DESC
       LIMIT 3`,
      [title] // Pass the user-provided title safely
    );

    if (result.rows.length > 0) {
      likelyMatches = result.rows.map((row) => ({
        title: row.title,
        price: row.price,
      }));

      const summaryForChatGpt = createReadableMatchSummaryForChatGPT(
        title,
        likelyMatches
      );
      console.log("here is the chatGPT summary in the dvd", summaryForChatGpt);

      console.log(`For title "${title}", top matches:`, likelyMatches);
      valueGoingToTheUI = `For title "${title}", top matches:, ${likelyMatches}`;
      let turnBoxGreenBecauseChatGPTThinksThereIsAMatch;
      // console.log("this is the value going to the UI", valueGoingToTheUI);
      const promptForAskingAboutPotentialMatch = `The following is a fuzzy logic search of a database of VHS titles. Your Job is determine if these
            // possible matches are indeed likely real life matches. Respond with "true" if any of them are, respond with "false" if these fuzzy logic matches
            // are a false positive. Erorr on the side of caution towards it being a match.  No other words of explantion are wanted - ${summaryForChatGpt}
            // `;
      console.log(
        "this is the toggle switch off the req-",
        req.query.extraAnalysis
      );
      if (req.query.extraAnalysis === "true") {
        console.log(
          "this is insidee the extraAnalysis if then",
          promptForAskingAboutPotentialMatch
        );
        // Wrap the logic in an async IIFE to ensure await works correctly
        const matchResult = await askChatGPTIfMatchIsReal(
          promptForAskingAboutPotentialMatch
        );
        console.log("Match result from GPT:", matchResult);
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch = matchResult
          .toString()
          .trim()
          .toLowerCase();
      }

      // Convert the cleaned array of matches into a readable string for the UI
      let colorForBackgroudOfDiv = "pink";
      console.log(
        "this is chatGPTs resopnse right before the turn green if then ",
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch
      );
      if (
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch === "true" ||
        turnBoxGreenBecauseChatGPTThinksThereIsAMatch === "True"
      ) {
        console.log("checking color", colorForBackgroudOfDiv);
        colorForBackgroudOfDiv = "lightgreen";
      }
      valueGoingToTheUI = `
   <div class="match-container" style="background-color:${colorForBackgroudOfDiv}">>
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

      // const promptForAskingAboutPotentialMatchWithPhoto = `The following is a fuzzy logic search of a database of VHS titles. Your Job is determine if these
      // possible matches are indeed likely real life matches. Respond with "true" if any of them are, respond with "false" if these fuzzy logic matches
      // are a false positive. Refer to photo for extra help - ${valueGoingToTheUI}
      // `;
      // askChatGPTIfMatchIsRealWithPhoto(
      //   img,
      //   promptForAskingAboutPotentialMatchWithPhoto
      // );
    } else {
      console.log("No close matches found for:", title);
    }
  } catch (error) {
    console.error("Database query failed:", error);
  }

  return valueGoingToTheUI;
}
async function useFuzzyLogicToSearchRailWaysDatabaseForMatch_CASSETTE(title) {
  let returnedMostLikelyTitle = null;
  let returnedPriceOfLikelyTitle = null;
  let valueGoingToTheUI = `No close matches found for: ${title}`;
  let likelyMatches = [];

  try {
    const result = await pool.query(
      `SELECT title, price
       FROM cassette_tapes
       WHERE similarity(title, $1) > 0.4
       ORDER BY similarity(title, $1) DESC
       LIMIT 3`,
      [title]
    );

    if (result.rows.length > 0) {
      likelyMatches = result.rows.map((row) => ({
        title: row.title,
        price: row.price,
      }));

      console.log(`For title "${title}", top matches:`, likelyMatches);
      valueGoingToTheUI = `For title "${title}", top matches:, ${likelyMatches}`;

      valueGoingToTheUI = `
      <div class="match-container">
        <p><strong>For title:</strong> <span class="title-in-match-container">"${title}"</span>, top matches:</p>
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
    } else {
      console.log("No close matches found for:", title);
    }
  } catch (error) {
    console.error("Database query failed:", error);
  }

  return valueGoingToTheUI;
}
async function useFuzzyLogicToSearchRailWaysDatabaseForMatch_CD(title) {
  let returnedMostLikelyTitle = null;
  let returnedPriceOfLikelyTitle = null;
  let valueGoingToTheUI = `No close matches found for: ${title}`;
  let likelyMatches = [];

  try {
    const result = await pool.query(
      `SELECT title, price
       FROM cd_items
       WHERE similarity(title, $1) > 0.4
       ORDER BY similarity(title, $1) DESC
       LIMIT 3`,
      [title]
    );

    if (result.rows.length > 0) {
      likelyMatches = result.rows.map((row, index) => ({
        title: row.title,
        price: row.price,
      }));

      console.log(`For title "${title}", top matches:`, likelyMatches);

      valueGoingToTheUI = `
      <div class="match-container">
        <p><strong>For title:</strong> <span class="title-in-match-container">"${title}"</span>, top matches:</p>
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
        useFuzzyLogicToSearchRailWaysDatabaseForMatch_VHS(
          title,
          file.buffer,
          req
        )
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

function runTheCassetteLogic(req, res) {
  console.log("Cassette mode is enabled! Querying database...");

  const promptTextArray = req.body.prompt;
  let promtForGPT = extractPrompt(promptTextArray);
  console.log("Prompt for Cassette:", promtForGPT);

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

      const rawContent = gptResult.message.content;
      const titlesInJSONFromChatGPT = JSON.parse(rawContent);
      const titlesInPlainEnglishFormat = titlesInJSONFromChatGPT.titles.map(
        (title) => title
      );

      console.log("Extracted Cassette Titles:", titlesInPlainEnglishFormat);

      const fuzzyLogicPromises = titlesInPlainEnglishFormat.map((title) =>
        useFuzzyLogicToSearchRailWaysDatabaseForMatch_CASSETTE(title)
      );

      const fuzzyResults = await Promise.all(fuzzyLogicPromises);

      return {
        extractedTitles: titlesInPlainEnglishFormat,
        fuzzyMatches: fuzzyResults,
      };
    } catch (error) {
      console.error("Error processing Cassette image:", error);
      return { error: "Failed to process Cassette image." };
    }
  });

  Promise.allSettled(promises).then((results) => {
    const successfulResults = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    console.log(
      "Final Cassette result going to UI:",
      JSON.stringify(successfulResults, null, 2)
    );

    res.json({
      results: successfulResults,
      imageKey: imageTOReturnToFrontEnd,
    });

    console.log("This is the successful Cassette result:", successfulResults);
  });
}

function runTheCDLogic(req, res) {
  console.log("CD mode is enabled! Querying database...");

  const promptTextArray = req.body.prompt;
  let promtForGPT = extractPrompt(promptTextArray);
  console.log("Prompt for CD:", promtForGPT);

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

      const rawContent = gptResult.message.content;
      const titlesInJSONFromChatGPT = JSON.parse(rawContent);
      const titlesInPlainEnglishFormat = titlesInJSONFromChatGPT.titles.map(
        (title) => title
      );

      console.log("Extracted CD Titles:", titlesInPlainEnglishFormat);

      const fuzzyLogicPromises = titlesInPlainEnglishFormat.map((title) =>
        useFuzzyLogicToSearchRailWaysDatabaseForMatch_CD(title)
      );

      const fuzzyResults = await Promise.all(fuzzyLogicPromises);

      return {
        extractedTitles: titlesInPlainEnglishFormat,
        fuzzyMatches: fuzzyResults,
      };
    } catch (error) {
      console.error("Error processing CD image:", error);
      return { error: "Failed to process CD image." };
    }
  });

  Promise.allSettled(promises).then((results) => {
    const successfulResults = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    console.log(
      "Final CD result going to UI:",
      JSON.stringify(successfulResults, null, 2)
    );

    res.json({
      results: successfulResults,
      imageKey: imageTOReturnToFrontEnd,
    });

    console.log("this is the successful CD results", successfulResults);
  });
}

async function askChatGPTIfMatchIsReal(promptForAskingAboutPotentialMatch) {
  // const base64Image = Buffer.from(img).toString("base64");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: ` ${promptForAskingAboutPotentialMatch}`,
          },
        ],
      },
    ],
  });
  console.log(
    "here is chat GPTs response to asking about the match,",
    response.choices[0].message.content
  );

  return response.choices[0].message.content;
}

async function askChatGPTIfMatchIsRealWithPhoto(
  img,
  promptForAskingAboutPotentialMatch
) {
  const base64Image = Buffer.from(img).toString("base64");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: ` ${promptForAskingAboutPotentialMatch}`,
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
    "here is chat GPTs response to asking about the match with regards to the photo",
    response.choices[0].message.content
  );

  return response.choices[0];
}

//next step is to
function createReadableMatchSummaryForChatGPT(title, matchesArray) {
  let summary = `Fuzzy match search results for: "${title}"\n`;

  if (!matchesArray || matchesArray.length === 0) {
    summary += "No matches found.\n";
    return summary;
  }

  matchesArray.forEach((match, index) => {
    summary += `${index + 1}. ${match.title} — Price: $${match.price}\n`;
  });

  return summary;
}
