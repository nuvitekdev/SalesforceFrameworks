import { LightningElement, api } from 'lwc';

export default class NuviPermitMap extends LightningElement {
    @api latitude;
    @api longitude;
    @api title = 'Permit Location';

    get markers() {
        const lat = parseFloat(this.latitude);
        const lng = parseFloat(this.longitude);
        if (isNaN(lat) || isNaN(lng)) {
            return [];
        }
        return [
            {
                location: { Latitude: lat, Longitude: lng },
                title: this.title
            }
        ];
    }
}

