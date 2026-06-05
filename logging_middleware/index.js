const axios = require("axios");
async function Log(stack, level, packageName, message) {
  try {
    const token = process.env.AUTH_TOKEN || "";
    await axios.post("http://4.224.186.213/evaluation-service/logs",
      { stack, level, package: packageName, message },
      { headers: { Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiIyM2JxMWE0MjgxQHZ2aXQubmV0IiwiZXhwIjoxNzgwNjM0NTU1LCJpYXQiOjE3ODA2MzM2NTUsImlzcyI6IkFmZm9yZCBNZWRpY2FsIFRlY2hub2xvZ2llcyBQcml2YXRlIExpbWl0ZWQiLCJqdGkiOiJhNjNiMzdhNy01ZWZlLTQzMDAtYmFlYy0wYjEyYmNhOGU5MWIiLCJsb2NhbGUiOiJlbi1JTiIsIm5hbWUiOiJrb2RhdmFsaSByZXNobWEiLCJzdWIiOiIyMjczMGM0MC1iMDc4LTQ1NTUtYjkzMC1mYzRmZTIyMDZlNjIifSwiZW1haWwiOiIyM2JxMWE0MjgxQHZ2aXQubmV0IiwibmFtZSI6ImtvZGF2YWxpIHJlc2htYSIsInJvbGxObyI6IjIzYnExYTQyODEiLCJhY2Nlc3NDb2RlIjoiUVFkRVl5IiwiY2xpZW50SUQiOiIyMjczMGM0MC1iMDc4LTQ1NTUtYjkzMC1mYzRmZTIyMDZlNjIiLCJjbGllbnRTZWNyZXQiOiJHWWVUY1FHRUVYTU1DUG5LIn0.sMPFxC7UqPKhZ1XWnT6o6dkdD-e23pUr7JoqFAL8qr4 } }
    );
  } catch (err) {
    console.error("Log failed:", err.message);
  }
}
module.exports = { Log };
