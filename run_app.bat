@echo off
title AltRix School ERP OS Launcher
echo ==============================================
echo        AltRix School ERP SaaS Launcher
echo ==============================================
echo.

echo [1/4] Terminating any ghost processes on ports 8000 and 8080...
:: Check port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    echo Killing process %%a on port 8000...
    taskkill /F /PID %%a 2>nul
)
:: Check port 8080
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING 2^>nul') do (
    echo Killing process %%a on port 8080...
    taskkill /F /PID %%a 2>nul
)

echo [2/4] Setting up Python Virtual Environment in backend...
cd backend
if exist .venv goto :venv_exists

echo Virtual environment (.venv) not found. Creating it...
python -m venv .venv
if errorlevel 1 goto :venv_fail

echo Installing backend dependencies from requirements.txt...
.venv\Scripts\pip install -r requirements.txt
if errorlevel 1 goto :pip_fail
goto :venv_done

:venv_exists
echo Virtual environment (.venv) found. Ensuring dependencies are installed...
.venv\Scripts\pip install -r requirements.txt
if errorlevel 1 goto :pip_fail
goto :venv_done

:venv_fail
echo.
echo ERROR: Failed to create python virtual environment.
echo Make sure Python is installed and added to your system environment variables (PATH).
cd ..
pause
exit /b

:pip_fail
echo.
echo ERROR: Failed to install pip packages from requirements.txt.
echo Check your internet connection and python packages.
cd ..
pause
exit /b

:venv_done
cd ..

echo [3/4] Starting backend FastAPI server in a new window...
start "AltRix Backend Server" cmd /k "cd backend && .venv\Scripts\python run.py"

echo [4/4] Starting frontend Vite server in a new window...
start "AltRix Frontend Server" cmd /k "npm run dev"

echo.
echo ==============================================
echo Launch complete!
echo - Frontend: http://127.0.0.1:8080/
echo - Backend API Docs: http://127.0.0.1:8000/docs
echo ==============================================
echo.
pause
