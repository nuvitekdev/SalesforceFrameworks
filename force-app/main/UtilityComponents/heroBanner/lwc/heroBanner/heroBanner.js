import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';

export default class HeroBanner extends LightningElement {
    @api height = '400px';
    @api backgroundImage;
    @api logo;
    @api headerText;
    @api subtitleText;
    @api headerTextColor = '#ffffff';
    @api subtitleTextColor = '#ffffff';

    connectedCallback() {
        if (this.logo) {
            console.log('Logo static resource name:', this.logo);
            console.log('Constructed logo URL:', this.logoUrl);
        }
        if (this.backgroundImage) {
            console.log('Background image static resource name:', this.backgroundImage);
            console.log('Constructed background URL:', this.backgroundImageUrl);
        }
    }

    get backgroundImageUrl() {
        if (!this.backgroundImage) return null;
        
        // Get the current URL path
        const path = window.location.pathname;
        // Check if we're in Experience Cloud
        const isExperienceCloud = path.includes('/s/') || path.includes('/site/');
        
        if (isExperienceCloud) {
            // For Experience Cloud, use the community path
            return `${window.location.origin}/sfsites/c/resource/${this.backgroundImage}`;
        } else {
            // For Lightning pages
            return `${window.location.origin}/resource/${this.backgroundImage}`;
        }
    }

    get bannerStyle() {
        let style = `height: ${this.height};`;
        if (this.backgroundImage) {
            style += `background-image: url(${this.backgroundImageUrl});`;
        }
        return style;
    }

    get logoUrl() {
        if (!this.logo) return null;
        
        // Get the current URL path
        const path = window.location.pathname;
        // Check if we're in Experience Cloud
        const isExperienceCloud = path.includes('/s/') || path.includes('/site/');
        
        if (isExperienceCloud) {
            // For Experience Cloud, use the community path
            return `${window.location.origin}/sfsites/c/resource/${this.logo}`;
        } else {
            // For Lightning pages
            return `${window.location.origin}/resource/${this.logo}`;
        }
    }

    get headerStyle() {
        return `color: ${this.headerTextColor};`;
    }

    get subtitleStyle() {
        return `color: ${this.subtitleTextColor};`;
    }
}