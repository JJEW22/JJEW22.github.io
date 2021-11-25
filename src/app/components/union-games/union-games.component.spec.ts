import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnionGamesComponent } from './union-games.component';

describe('UnionGamesComponent', () => {
  let component: UnionGamesComponent;
  let fixture: ComponentFixture<UnionGamesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ UnionGamesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UnionGamesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
