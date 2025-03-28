import { LightningElement, api, track } from 'lwc';

export default class FileGenerator extends LightningElement {
    @api textListString; // Passed in as a JSON string
    @api urlListString;  // Passed in as a JSON string
    @api desiredFileTypes; // Comma-separated list of desired file types (e.g., 'json, text, markdown')

    @track textValues = [];
    @track urlValues = [];

    connectedCallback() {
        // Parse the JSON strings into arrays
        try {
            let textParsed = JSON.parse(this.textListString);
            let urlParsed = JSON.parse(this.urlListString);

            // Check if parsed objects are already arrays, if not, wrap them in an array
            this.textValues = Array.isArray(textParsed) ? textParsed : [textParsed];
            this.urlValues = Array.isArray(urlParsed) ? urlParsed : [urlParsed];
        } catch (e) {
            console.error('Error parsing JSON strings:', e);
            // Handle error or set default values
            this.textValues = [];
            this.urlValues = [];
        }
    }

    handleInputChange(event) {
        const fieldLabel = event.target.label;
        const fieldValue = event.target.value;

        let found = false;
        // Update the appropriate text or URL value
        this.textValues = this.textValues.map(item => {
            if (item.label === fieldLabel) {
                found = true;
                return { ...item, value: fieldValue };
            }
            return item;
        });

        if (!found) {
            this.urlValues = this.urlValues.map(item => {
                if (item.label === fieldLabel) {
                    return { ...item, value: fieldValue };
                }
                return item;
            });
        }
    }
   
    downloadData() {
        try {
            let realTextValues = JSON.parse(JSON.stringify(this.textValues));
            let realUrlValues = JSON.parse(JSON.stringify(this.urlValues));

            // Creating the JSON data
            let jsonData = {
                TextData: this.prepareData(realTextValues),
                UrlData: this.prepareData(realUrlValues)
            };

            // Creating the Text data
            let textData = this.createTextData(realTextValues, realUrlValues);

            // Creating the Markdown data with clickable links
            let markdownData = this.createMarkdownData(realTextValues, realUrlValues);

            // Determine the file types to download
            let fileTypes = this.desiredFileTypes.split(',').map(type => type.trim().toLowerCase());

            // Download JSON file if requested
            if (fileTypes.includes('json')) {
                let jsonUri = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(jsonData));
                this.downloadFile(jsonUri, 'Report Unique Identifier.json');
            }

            // Download Text file if requested
            if (fileTypes.includes('text')) {
                let textUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(textData);
                this.downloadFile(textUri, 'Report Unique Identifier.txt');
            }

            // Download Markdown file with clickable links if requested
            if (fileTypes.includes('markdown')) {
                let markdownUri = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdownData);
                this.downloadFile(markdownUri, 'Report Unique Identifier.md');
            }
        } catch (error) {
            console.error('Error in downloadData:', error);
        }
    }

    prepareData(data) {
        return data.reduce((acc, item) => {
            Object.keys(item).forEach(key => {
                acc[key] = item[key];
            });
            return acc;
        }, {});
    }

    createTextData(textValues, urlValues) {
        let textData = '';
    
        textValues.forEach(item => {
            Object.keys(item).forEach(key => {
                textData += `${key}: ${item[key]}\n\n`;
            });
        });
    
        urlValues.forEach(item => {
            Object.keys(item).forEach(key => {
                // Assuming URL format, use the plain URL without Markdown link syntax
                textData += `${key}:\n${item[key]}\n\n`;
            });
        });
    
        return textData;
    }
    
    
    createMarkdownData(textValues, urlValues) {
        let markdownData = '';
    
        textValues.forEach(item => {
            Object.keys(item).forEach(key => {
                markdownData += `${key}: ${item[key]}\n\n`;
            });
        });
    
        urlValues.forEach(item => {
            Object.keys(item).forEach(key => {
                // Assuming URL format, use the plain URL on one line and add an empty line for separation
                markdownData += `${key}:\n${item[key]}\n\n`;
            });
        });
    
        return markdownData;
    }
    

    downloadFile(uri, filename) {
        let linkElement = document.createElement('a');
        linkElement.setAttribute('href', uri);
        linkElement.setAttribute('download', filename);
        linkElement.click();
    }
}