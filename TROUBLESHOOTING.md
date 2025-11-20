# Troubleshooting Guide - Google Apps Script Setup

## Step-by-Step Setup Instructions

### 1. Open Apps Script Editor
1. Open your Google Sheet
2. Click **Extensions** → **Apps Script** (or **Tools** → **Script editor** in older versions)
3. A new tab will open with the Apps Script editor

### 2. Clear Default Code
- Delete any existing code in the editor (usually there's a default `myFunction()`)

### 3. Paste the Script
- Copy the **entire contents** of `emissions-calculator.gs`
- Paste it into the Apps Script editor
- Make sure you paste ALL the code (should be ~450+ lines)

### 4. Save the Script
- Click the **Save** icon (💾) or press `Ctrl+S` / `Cmd+S`
- Give your project a name (e.g., "Stadium Emissions Calculator")
- The script will auto-save

### 5. Authorize the Script (First Time Only)
- Go back to your Google Sheet
- In any cell, type: `=TEST_EMISSIONS_SCRIPT()`
- Press Enter
- You'll see a popup asking for authorization
- Click **Review Permissions**
- Choose your Google account
- Click **Advanced** → **Go to [Project Name] (unsafe)**
- Click **Allow**
- This is safe - the script only runs in your sheet, no external access

### 6. Test the Script
After authorization, the cell should show:
```
SUCCESS: Script is working! Try: =CALCULATE_APPCHAIN_EMISSIONS(5.5)
```

### 7. Try a Real Function
In a new cell, try:
```
=CALCULATE_APPCHAIN_EMISSIONS(5.5)
```

You should see an object with emissions data.

## Common Issues & Solutions

### Issue: "Unknown function" or "#NAME?" error

**Possible Causes:**
1. Script not saved
2. Script not authorized
3. Function name typo
4. Script not linked to the sheet

**Solutions:**
1. ✅ Go back to Apps Script editor and click **Save**
2. ✅ Refresh your Google Sheet (F5 or reload page)
3. ✅ Check function name spelling (case-sensitive!)
4. ✅ Make sure you're using the script in the same Google Sheet where you created it
5. ✅ Try the test function first: `=TEST_EMISSIONS_SCRIPT()`

### Issue: Script saved but functions don't appear

**Solution:**
- Close and reopen the Apps Script editor
- Go back to your sheet and refresh (F5)
- Wait 10-30 seconds (Google sometimes needs a moment to sync)
- Try typing `=TEST_` and see if autocomplete suggests `TEST_EMISSIONS_SCRIPT`

### Issue: "You do not have permission to call that function"

**Solution:**
- This means authorization is needed
- Type `=TEST_EMISSIONS_SCRIPT()` in a cell
- Follow the authorization prompts
- You may need to click "Advanced" and "Go to [project] (unsafe)"

### Issue: Functions work but return errors

**Check:**
1. Are you providing the right number of parameters?
2. Are the parameter types correct (numbers, not text)?
3. Check the error message - it will tell you what's wrong

**Example:**
- ❌ `=CALCULATE_APPCHAIN_EMISSIONS("5.5")` - Text instead of number
- ✅ `=CALCULATE_APPCHAIN_EMISSIONS(5.5)` - Correct

### Issue: Object results show as "#REF!" or don't display

**Solution:**
- Google Sheets displays objects in a special way
- To extract specific values, use dot notation:
  ```
  =SIMULATE_EMISSIONS(0,50000,1000000,220,0.5,10000).totalEmissionPerEpoch
  ```

### Issue: Script works in one sheet but not another

**Solution:**
- Each Google Sheet needs its own copy of the script
- Copy the script to the Apps Script editor in the new sheet
- Or use the same sheet for all calculations

## Verification Checklist

Before asking for help, verify:

- [ ] Script is saved in Apps Script editor
- [ ] Script is authorized (no permission errors)
- [ ] Test function works: `=TEST_EMISSIONS_SCRIPT()`
- [ ] Function names are spelled correctly (case-sensitive)
- [ ] Parameters are numbers, not text
- [ ] Sheet has been refreshed after saving script

## Quick Test Commands

Try these in order:

1. **Test script is loaded:**
   ```
   =TEST_EMISSIONS_SCRIPT()
   ```
   Should return: "SUCCESS: Script is working!..."

2. **Test simple calculation:**
   ```
   =CALCULATE_APPCHAIN_EMISSIONS(5.5)
   ```
   Should return an object

3. **Test extracting a value:**
   ```
   =CALCULATE_APPCHAIN_EMISSIONS(5.5).stadiumEmissionPerEpoch
   ```
   Should return a number (around 36,666.67)

4. **Test full simulation:**
   ```
   =SIMULATE_EMISSIONS(0,50000,1000000,220,0.5,10000)
   ```
   Should return a comprehensive object

## Still Not Working?

If none of the above works:

1. **Check the Apps Script editor for errors:**
   - Look for red error messages
   - Check the execution log (View → Execution log)

2. **Try a minimal test:**
   - Create a new function in Apps Script:
     ```javascript
     function HELLO() {
       return "Hello World";
     }
     ```
   - Save and test: `=HELLO()` in your sheet
   - If this doesn't work, there's a deeper Google Sheets/Apps Script issue

3. **Check Google Sheets version:**
   - Make sure you're using the current version of Google Sheets
   - Try in an incognito/private browser window

4. **Contact info to share:**
   - What error message you see (exact text)
   - Which function you're trying to use
   - What parameters you're passing
   - Screenshot of the error (if possible)

