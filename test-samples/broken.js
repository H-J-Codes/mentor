console.log("Starting the program...");

const numbers = [1, 2, 3];
console.log(numbers[1].toString()); // this will crash: numbers[5] doesn't exist

console.log("This line will never run");
