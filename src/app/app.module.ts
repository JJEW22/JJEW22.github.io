import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { HomeComponent } from './components/home/home.component';
import { ResearchComponent } from './components/research/research.component';
import { TeachingComponent } from './components/teaching/teaching.component';
import { AboutComponent } from './components/about/about.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { UnionGamesComponent } from './components/union-games/union-games.component';
import { EightBitComponent } from './components/union-games/eight-bit/eight-bit.component';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    HomeComponent,
    ResearchComponent,
    TeachingComponent,
    AboutComponent,
    ProjectsComponent,
    UnionGamesComponent,
    EightBitComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
