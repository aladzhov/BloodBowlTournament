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
  },
  'Nikolay Arabadzhiev': {
    intro: `The national team captain`,
    questions: [
      {
        question: "When and how did you start playing?",
        answer: "I started with Blood Bowl Chaos edition on PC around 2014. I couldn't make much sense of it but always enjoyed turn based strategy games like X-Com and it looked fun. I mostly watched cKnoor's tutorials on youtube until the BB2016 was announced."
      },
      {
        question: "Who introduced you to Blood Bowl",
        answer: "I found the game by myself looking through Steam discount deals. Initially I overlooked Blood Bowl as it seemed like a NFL/FIFA game, but my interest peaked when I realized it's turn based."
      },
      {
        question: "1-5 - how competitive are you",
        answer: "For BB I would say 2. It's hard to try-hard in a dice game, but it is fun to consider probabilities and try to play to the best of my abilities."
      },
      {
        question: "Which is your favorite team",
        answer: "While I haven't yet played all the teams, I find Imperial Nobility to fit me the best so far. I am excited to give OWA a try with the new ruleset."
      },
      {
        question: "Who is your favorite player",
        answer: "I don't think I have one that really stands out, I look at the game in more of a team vibe along with the model sculpts. I guess to give an answer, the human linemen as the baseline of average, universally ok, but not special. I look at the models as very representative of the concept of BB."
      },
      {
        question: "If there is one thing you can change in Blood Bowl, what would it be",
        answer: "Minor changes to streamline rules and rules writing. I don't like rules about something that only works on the first Tuesday of the month before noon in the summer..."
      },
      {
        question: "What are some of your most memorable moments",
        answer: "Uphilling a troll into a KO and triple skulling a block ogre into a knoblar (the dumb fun ones). The first Eurobowl (Europen) experience in Wales 2018 was special, a very fun time and meeting so many people who love the same hobby. Also the first time we played in the actual Eurobowl as a national team in Greece in 2024. Everyone seemed to feel more relaxed and we got to have drinks with the Germany team which was fun."
      },
      {
        question: "What do you like about Blood Bowl in general",
        answer: "It is a non-war related table top game which is mostly miniature-agnostic. It gives me creative freedom for the hobby side and it's probably the most comfortable duration to banter and chat over a drink. Being a dice game, I get to witness emergent stories unfold and it's hard to take it too seriously which makes it a chill social activity."
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

