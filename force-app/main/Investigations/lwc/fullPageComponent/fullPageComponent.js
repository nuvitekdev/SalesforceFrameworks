import { LightningElement, api } from 'lwc';

export default class FullPageComponent extends LightningElement {
    @api backgroundColor = '#f0f0f0'; // Default color

    get style() {
        return `background-color: ${this.backgroundColor}; height: 100vh; width: 100vw;`;
    }
}