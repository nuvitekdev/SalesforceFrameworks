import { LightningElement, wire, track } from "lwc";
import getWhistleblowerNews from "@salesforce/apex/WhistleblowerNewsFeedService.getWhistleblowerNews";

export default class WhistleblowerNewsFeed extends LightningElement {
  @track newsItems = [];
  @track error;
  currentIndex = 0; // Track the current slide index

  connectedCallback() {
    // Start the carousel slide animation
    this.startCarouselAnimation();
  }

  @wire(getWhistleblowerNews)
  wiredNews({ error, data }) {
    if (data) {
      this.newsItems = data;
      this.error = undefined;
    } else if (error) {
      this.error = error;
      this.newsItems = undefined;
    }
  }

  startCarouselAnimation() {
    setInterval(() => {
      this.nextSlide();
    }, 7000); // Change slide every 7 seconds
  }

  nextSlide() {
    const carousel = this.template.querySelector(".carousel");
    if (carousel) {
      carousel.appendChild(carousel.querySelector(".carousel-slide"));
      this.currentIndex = (this.currentIndex + 1) % this.newsItems.length;
      this.resetTransition();
    }
  }

  prevSlide() {
    const carousel = this.template.querySelector(".carousel");
    if (carousel) {
      const slides = carousel.querySelectorAll(".carousel-slide");
      carousel.insertBefore(slides[slides.length - 1], slides[0]);
      this.currentIndex =
        (this.currentIndex - 1 + this.newsItems.length) % this.newsItems.length;
      this.resetTransition();
    }
  }

  resetTransition() {
    const carousel = this.template.querySelector(".carousel");
    if (carousel) {
      carousel.style.transition = "none";
      setTimeout(() => {
        carousel.style.transition = "transform 1.5s ease";
      }, 100);
    }
  }
}
