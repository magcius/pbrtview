
import { createViewer } from './pbrtview';

class Main {
    canvas: HTMLCanvasElement;

    constructor() {
        this.canvas = document.createElement('canvas');
        document.body.appendChild(this.canvas);
        window.onresize = this._onResize.bind(this);
        this._onResize();

        createViewer(this.canvas);
    }

    _onResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
}

window.main = new Main();
