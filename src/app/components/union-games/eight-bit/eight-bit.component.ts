import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-eight-bit',
  templateUrl: './eight-bit.component.html',
  styleUrls: ['./eight-bit.component.scss']
})
export class EightBitComponent implements OnInit {
  binaryStringMatrix:String[][] = [];
  constructor() {
    for (let i = 0; i < 3; i++) {
      let decimalNumber: number = Math.floor(Math.random() * 256);
      let binaryString: String = decimalNumber.toString(2);
      binaryString = binaryString.padStart(8, "0");
      let binaryArray: String[] = [...binaryString];
      this.binaryStringMatrix.push(binaryArray);
    }
  }

  ngOnInit(): void {
  }

}
