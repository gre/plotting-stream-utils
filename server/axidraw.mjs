export default function (app) {
  function parseAxiDrawEvent({ pen_down_travel_inches, time }) {
    const meters = parseFloat(pen_down_travel_inches) * 0.0254;
    const seconds = parseFloat(time);
    return { meters, seconds };
  }

  // TODO save in a db
  const initialState = {
    // all the runs
    runs: [],
    // current run index
    index: 0,
    // current run progress
    progressMeters: 0,
    progressSeconds: 0,
    // progress delta track the accumulated progress during pauses
    accProgressMeters: 0,
    accProgressSeconds: 0,
  };

  let state = initialState;

  app.get("/runs/state", (req, res) => {
    res.send(state);
  });

  app.post("/runs/:index/setcolor", (req, res) => {
    try {
      state.runs[req.params.index].color = req.body.color;
      res.send();
    } catch (e) {
      res.status(400).send();
    }
  });

  app.post("/runs/full-reset", (req, res) => {
    state = initialState;
    res.send();
  });

  app.post("/runs/run-reset", (req, res) => {
    state = {
      ...state,
      progressMeters: 0,
      progressSeconds: 0,
      accProgressMeters: 0,
      accProgressSeconds: 0,
    };
    res.send();
  });

  app.post("/runs/new", (req, res) => {
    const evt = parseAxiDrawEvent(req.body);
    if (state.index >= state.runs.length) {
      // reset if it's a new run and the current index reached end
      state = initialState;
    }
    state = {
      ...state,
      runs: state.runs.concat({
        color: "",
        meters: evt.meters,
        seconds: evt.seconds,
      }),
    };
    res.send();
  });

  app.post("/runs/finish", (req, res) => {
    const evt = parseAxiDrawEvent(req.body);
    state = {
      ...state,
      index: state.index + 1,
      progressMeters: 0,
      progressSeconds: 0,
      accProgressMeters: 0,
      accProgressSeconds: 0,
    };
    res.send();
  });

  app.post("/runs/paused", (req, res) => {
    const evt = parseAxiDrawEvent(req.body);
    state = {
      ...state,
      accProgressMeters: state.accProgressMeters + evt.meters,
      accProgressSeconds: state.accProgressSeconds + evt.seconds,
      progressMeters: 0,
      progressSeconds: 0,
    };
    res.send();
  });

  app.post("/runs/update", (req, res) => {
    const evt = parseAxiDrawEvent(req.body);
    console.log(evt);
    state = {
      ...state,
      progressMeters: evt.meters,
      progressSeconds: evt.seconds,
    };
    res.send();
  });
}
