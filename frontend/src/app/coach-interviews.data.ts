export interface CoachInterviewQuestion {
  question: string;
  answer: string;
}

export interface CoachInterview {
  intro: string;
  questions: CoachInterviewQuestion[];
}

export const coachInterviews: Record<string, CoachInterview> = {
  'Emil Tzanev': {
    intro: `Our beloved TO and NC`,
    questions: [
      {
        question: "When and how did you start playing?",
        answer: "I saw the first PC game when I was a student (may be 2009 or 2010). I've played some games but didn't quite understood it at the time. I really liked the concept though and when GW renewed their production (I think late 2016) I bought the starter box."
      },
      {
        question: "Who introduced you to Blood Bowl?",
        answer: "I guess I've introduced myself. When the 2016 starter box hit the BG stores I asked the storeowners who they sold boxes to and I tried to contact them. Then I organised the first season of Kompot League in 2017 with only 6 players."
      },
      {
        question: "1-5 - how competitive are you?",
        answer: "About 3, may be less. I look at Blood Bowl as a way to relax from my work (which is indeed competitive)."
      },
      {
        question: "Which is your favorite team?",
        answer: "Necromantic Horror. That has always been my favourite right from the start. I've played Necro for 30+ seasons in one of the Blood Bowl 2 major online leagues. Can't wait to play them again in tournaments."
      },
      {
        question: "Who is your favorite player?",
        answer: "As a positional - Werewolf. As a named Star - Wilhelm Chaney (who happens to be a werewolf himself)."
      },
      {
        question: "If there is one thing you can change in Blood Bowl, what would it be?",
        answer: "I would remove the stall penalty, but that's only because I'm a dirty staller. Otherwise the change is good."
      },
      {
        question: "What are some of your most memorable moments?",
        answer: "I think the best personal moment I had was when I won the best painted team in Eurobowl (Malta). Next in line are all the award ceremonies we have in our local tournaments - that's always my favorite part of our hobby - having happy people enjoying what they're doing. As for results - I remember vividly the first Euro we attended back in Wales (2018) and the World Cup in Spain (2023). I've managed to finish 13th in Wales (5-1) and 63rd in Spain (6-2-1). In Spain our team played very well and we finished in the middle of all teams (160th out of 372 - with 2232 players total in the tournament). The other memorable tournament was the first World Cup in Austria when I've managed to not score the winning touchdown in two games by rolling snake eyes for the rush in the last turn."
      }
    ]
  }
};

export function hasCoachInterview(coach: string): boolean {
  return Object.hasOwn(coachInterviews, coach);
}

export function getCoachInterview(coach: string): CoachInterview {
  return coachInterviews[coach];
}

