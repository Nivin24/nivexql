import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024 });
  const svgPath = path.join(__dirname, 'public/logo.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  // Scale the SVG viewBox/dimensions to 1024x1024
  const scaledSvg = svgContent
    .replace('width="128"', 'width="1024"')
    .replace('height="128"', 'height="1024"');

  const tempHtmlPath = path.join(__dirname, 'temp-logo.html');
  const htmlContent = `
    <html>
      <body style="margin:0; padding:0; overflow:hidden; background:transparent;">
        <div id="container" style="width:1024px; height:1024px;">
          ${scaledSvg}
        </div>
      </body>
    </html>
  `;
  
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');
  win.loadFile(tempHtmlPath);

  win.webContents.once('did-finish-load', async () => {
    // Wait a brief moment for rendering / gradients / filters to process
    await new Promise(resolve => setTimeout(resolve, 800));
    const image = await win.capturePage();
    const pngBuffer = image.toPNG();
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempHtmlPath);
    } catch (e) {}
    
    // Ensure build directory exists
    const buildDir = path.join(__dirname, 'build');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir);
    }
    
    fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffer);
    fs.writeFileSync(path.join(__dirname, 'public/logo.png'), pngBuffer);
    console.log('Successfully generated logo.png and build/icon.png!');
    app.quit();
  });
});
