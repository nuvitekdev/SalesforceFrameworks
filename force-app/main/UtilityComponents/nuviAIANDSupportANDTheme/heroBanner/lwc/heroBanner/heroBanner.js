import { LightningElement, api } from "lwc";
import { loadScript, loadStyle } from "lightning/platformResourceLoader";

export default class HeroBanner extends LightningElement {
  @api height = "400px";
  @api backgroundImage;
  @api logo;
  @api headerText;
  @api subtitleText;
  @api headerTextColor = "#ffffff";
  @api subtitleTextColor = "#ffffff";

  // Background video support (mirrors nuvitekCustomThemeLayout behavior)
  @api showBackgroundVideo = false;
  @api backgroundVideoUrl; // Static resource name for video (mp4)
  @api backgroundVideoFallbackUrl; // Static resource name for poster/fallback image
  @api backgroundVideoDarkness = 35; // 0-100 overlay darkness

  connectedCallback() {
    if (this.logo) {
      console.log("Logo static resource name:", this.logo);
      console.log("Constructed logo URL:", this.logoUrl);
    }
    if (this.backgroundImage) {
      console.log(
        "Background image static resource name:",
        this.backgroundImage
      );
      console.log("Constructed background URL:", this.backgroundImageUrl);
    }
  }

  get backgroundImageUrl() {
    if (!this.backgroundImage) return null;

    // Get the current URL path
    const path = window.location.pathname;
    // Check if we're in Experience Cloud
    const isExperienceCloud = path.includes("/s/") || path.includes("/site/");

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
    // Only show background image when not using video
    if (this.backgroundImage && !this.showBackgroundVideo) {
      style += `background-image: url(${this.backgroundImageUrl});`;
    }
    return style;
  }

  get logoUrl() {
    if (!this.logo) return null;

    // Get the current URL path
    const path = window.location.pathname;
    // Check if we're in Experience Cloud
    const isExperienceCloud = path.includes("/s/") || path.includes("/site/");

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

  // Build full resource path with Experience Cloud awareness (reuses existing pattern)
  getResourcePath(resourceName) {
    if (!resourceName) return "";
    const path = window.location.pathname;
    const isExperienceCloud = path.includes("/s/") || path.includes("/site/");
    return isExperienceCloud
      ? `${window.location.origin}/sfsites/c/resource/${resourceName}`
      : `${window.location.origin}/resource/${resourceName}`;
  }

  get resolvedVideoUrl() {
    return this.backgroundVideoUrl
      ? this.getResourcePath(this.backgroundVideoUrl)
      : "";
  }

  get resolvedFallbackUrl() {
    return this.backgroundVideoFallbackUrl
      ? this.getResourcePath(this.backgroundVideoFallbackUrl)
      : "";
  }

  get videoOverlayStyle() {
    const opacity = Math.max(0, Math.min(100, Number(this.backgroundVideoDarkness))) / 100;
    return `background-color: rgba(0, 0, 0, ${opacity});`;
  }

  get heroBannerClass() {
    return this.showBackgroundVideo ? "hero-banner has-video" : "hero-banner";
  }
}
