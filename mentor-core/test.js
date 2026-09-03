import chalk from "chalk";

function getHintFromAI(errorType) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Think carefully about your ${errorType}.`);
    }, 1500);
  });
}

async function handleError(errorObject) {
  const errorAsJSON = JSON.stringify(errorObject);
  console.log(chalk.red("Error detected:"), errorAsJSON);

  console.log(chalk.yellow("Thinking of a hint..."));
  const hint = await getHintFromAI(errorObject.type);

  console.log(chalk.green("Hint ready:"), hint);
}

const currentError = {
  type: "boundary condition",
  file: "search.js",
  line: 12,
};

handleError(currentError);
