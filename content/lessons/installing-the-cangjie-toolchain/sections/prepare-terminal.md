On Windows, you can use the executable installer or extract the ZIP. If you use the ZIP, load the setup script for your shell, the program that reads your terminal commands. Here is the PowerShell command; replace the sample path with the location of your extracted SDK:

```powershell
. C:/tools/cangjie/envsetup.ps1
```

On Linux or macOS, extract the matching archive. Then load its environment in your shell, using the path where you extracted it:

```bash
source /path/to/cangjie/envsetup.sh
```

This setup applies to the terminal you have open. If you open a new one, run the setup script there too, unless you have configured your shell to load it automatically.
