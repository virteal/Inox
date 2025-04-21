/**
 * Serra - AI-controlled Dashboard Designer/Runner
 * 
 * Main entry point that integrates Inox as a scripting language
 */

import { SerraDashboard } from './serra-dashboard';
import path from 'path';

async function main() {
  console.log("Starting Serra Dashboard with Inox integration...");
  
  // Create the dashboard
  const dashboard = new SerraDashboard();
  
  // Initialize the dashboard
  const initialized = await dashboard.initialize();
  if (!initialized) {
    console.error("Failed to initialize Serra dashboard");
    process.exit(1);
  }
  
  console.log("Serra dashboard initialized successfully");
  
  // Load a sample dashboard script
  try {
    const scriptPath = path.resolve(__dirname, '../examples/simple-dashboard.nox');
    console.log(`Loading dashboard script: ${scriptPath}`);
    await dashboard.createDashboard(scriptPath);
    console.log("Dashboard created successfully");
    
    // In a real application, you'd start your UI framework here
    // For example, if using Express:
    // const app = express();
    // app.listen(3000, () => console.log('Serra dashboard running on port 3000'));
    
    // For this example, we'll just keep the process running
    console.log("Serra dashboard running (Press Ctrl+C to exit)");
  } catch (error) {
    console.error("Error loading dashboard:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
