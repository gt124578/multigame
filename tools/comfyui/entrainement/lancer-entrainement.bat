@echo off
rem Lance l'entrainement de la LoRA HGSS (FLUX.2 Klein 4B) avec AI-Toolkit installe dans C:\ai-toolkit.
rem Avant : hgss_klein4b.yaml copie dans C:\ai-toolkit\config\ et le jeu de donnees dans C:\ai-toolkit\datasets\hgss\{marche,combat}\
cd /d C:\ai-toolkit
if exist .venv\Scripts\activate.bat (call .venv\Scripts\activate.bat) else (call venv\Scripts\activate.bat)
python run.py config\hgss_klein4b.yaml
echo.
echo Fini. Les LoRA sont dans C:\ai-toolkit\output\hgss_klein4b\ : copie la meilleure dans ComfyUI\models\loras\ sous le nom hgss_klein4b.safetensors
pause
