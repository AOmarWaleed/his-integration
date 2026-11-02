import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// !  load files from templates folder by name 
export function loadTemplate(templateName) {
  const templatePath = path.resolve(__dirname, "../templates", `${templateName}`);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
    }

    try {
        const templateContent = fs.readFileSync(templatePath, "utf-8");
        return (templateContent);
    } catch (error) {
        console.error(`Error loading template ${templateName}:`, error);
        throw error;
    }
}