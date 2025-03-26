# **Quick-Start Guide for a Git-Based Development Workflow (Using Visual Interfaces)**

## **1. Prerequisites**
1. **Install Git**  
   - Download and install from [https://git-scm.com/downloads](https://git-scm.com/downloads).  

2. **Install VS Code**  
   - Download and install from [https://code.visualstudio.com/download](https://code.visualstudio.com/download).  
   - Recommended Extensions: **Salesforce Extension Pack**, **Prettier**, and **ESLint**.

3. **GitHub Account**  
   - Log into or sign up at [https://github.com](https://github.com).  
   - Make sure you have read/write access to the team’s repository.

---

## **2. Cloning the Repository via VS Code UI**
1. In **VS Code**, open the **Source Control** panel (Ctrl+Shift+G on Windows, Cmd+Shift+G on Mac).
2. Click **Clone Repository**.  
3. Select **“Clone from GitHub”**.  
4. Enter the GitHub repository URL or pick from the list if you’re signed in.  
5. Choose a folder to store the project files.  
6. When prompted, **Open** the cloned repository in VS Code.

---

## **3. Creating a Feature Branch in the VS Code UI**
1. **Open the Branch Menu**  
   - In the bottom-left corner of VS Code, click the current branch name (often says “development”).
2. **Create New Branch**  
   - Select **“Create New Branch…”** from the menu.  
   - Enter a descriptive name, such as `feature/alex-xyz` or `feature/vaas-updates`.
3. **Check You’re on the New Branch**  
   - Confirm the branch name displayed at the bottom-left has changed to your new branch.

---

## **4. Daily Workflow Using VS Code & GitHub UI**

### **Pulling Latest Changes from Development**
1. In the bottom-left branch menu, switch back to the **development** branch.  
2. In the **Source Control** panel, click **“Pull”** or **“Sync Changes”** to pull the latest updates from GitHub.
3. Switch again to your **feature branch** in the branch menu.
4. In **Source Control**, you may see a prompt to **merge** or **pull** changes into your branch. Confirm it.

### **Committing & Pushing Changes**
1. Click **Source Control** in VS Code (the icon that looks like a branch).  
2. Stage modified files by clicking the plus (+) icon next to each one.  
3. Enter a short commit message in the text box (e.g., “Add new LWC for UI changes”).  
4. Click the checkmark to commit.  
5. Click **“Sync Changes”** or **“Push”** to upload your branch commits to GitHub.

---

## **5. Creating a Pull Request in GitHub UI**
1. Go to **GitHub.com** and open your repository.
2. Click **“Pull requests”** at the top.
3. Click **“New pull request”**.  
4. For the **base** branch, select **development**. For the **compare** branch, select **your feature branch**.
5. Give the pull request a clear title and description.
6. Click **“Create pull request.”**

---

## **6. Merging Pull Requests & Updating Branches**
1. Team members can review your pull request in GitHub.
2. If changes are requested, make them in VS Code on your feature branch, commit, and push again. The pull request will update automatically.
3. When the PR is approved, click **“Merge”** in GitHub.
4. After merging, **switch** back to **development** in VS Code and **pull** changes.  
5. You can **delete** your feature branch in GitHub if no longer needed.

---

## **7. Quick Tips**
- **Sync Daily**: Always pull the latest changes from **development** before working each day.
- **Use Clear Names**: Name branches to match the work being done (e.g., `feature/vaas-inspections`).
- **Short, Frequent Commits**: Commit often to avoid large, conflicting changes.  
- **Visual Merge Conflict Resolution**: If conflicts occur, VS Code will display conflicts in the editor. Choose which version to keep, then commit.  
- **Ask for Help**: If stuck, check with teammates or references. Visual merges are usually simpler to handle with frequent syncs.