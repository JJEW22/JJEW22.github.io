import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EightBitComponent } from './eight-bit.component';

describe('EightBitComponent', () => {
  let component: EightBitComponent;
  let fixture: ComponentFixture<EightBitComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EightBitComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EightBitComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
