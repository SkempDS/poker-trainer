@echo off
chcp 65001 >nul
setlocal EnableExtensions

title 卸载 德州扑克

set "TARGET=%LOCALAPPDATA%\TexasHoldem"

echo.
echo === 卸载 德州扑克 ===
echo.
echo 将要清理：
echo   1) 桌面与开始菜单的「德州扑克」快捷方式
echo   2) 缓存目录 %TARGET%
echo.

rem --- 安全护栏：确认路径确实是我们的目录，防止变量异常时误删别处 ---
rem 判定条件：路径必须以 \TexasHoldem 结尾，且长度合理
for %%A in ("%TARGET%") do set "LAST=%%~nxA"
if /i not "%LAST%"=="TexasHoldem" (
    echo [中止] 目标路径异常：%TARGET%
    echo 未做任何删除。
    pause
    exit /b 1
)
if not defined LOCALAPPDATA (
    echo [中止] 读不到 LOCALAPPDATA，未做任何删除。
    pause
    exit /b 1
)

echo 清理快捷方式...
if exist "%USERPROFILE%\Desktop\德州扑克.lnk" (
    del /f /q "%USERPROFILE%\Desktop\德州扑克.lnk" 2>nul && echo   - 已删桌面快捷方式
)
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\德州扑克.lnk" (
    del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\德州扑克.lnk" 2>nul && echo   - 已删开始菜单快捷方式
)

echo.
echo 清理缓存目录...
if exist "%TARGET%" (
    rd /s /q "%TARGET%" 2>nul
    if exist "%TARGET%" (
        echo   [失败] 目录仍存在，可能被占用。请关掉游戏窗口后重试。
    ) else (
        echo   - 已删除 %TARGET%
    )
) else (
    echo   - 目录不存在，无需清理
)

echo.
echo 完成。
echo.
echo 最后一步：把这个文件夹整个删掉即可完全清除。
echo 位置：%~dp0
echo.
pause
endlocal
