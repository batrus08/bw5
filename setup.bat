@echo off
REM Setup script to download repository, install dependencies, and run server

REM Download repository zip if not exists
echo Checking if repository already downloaded...
IF NOT EXIST bw5-main (
    echo Downloading repository...
    powershell -Command "Invoke-WebRequest -Uri https://github.com/batrus08/bw5/archive/refs/heads/main.zip -OutFile bw5.zip"
    echo Unzipping...
    powershell -Command "Expand-Archive -Path bw5.zip -DestinationPath . -Force"
    del bw5.zip
) ELSE (
    echo Repository already downloaded.
)

REM Navigate into project folder
cd bw5-main

REM Install dependencies
echo Installing dependencies...
npm install

REM Generate Prisma client
echo Generating Prisma client...
npx prisma generate

REM Start the application
echo Starting application...
npm start
