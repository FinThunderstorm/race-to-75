import racer from './assets/racer.png'

export const Racer = () => (
  <div className="racer" aria-hidden="true">
    <div className="racer-sprite">
      <div className="racer-base" style={{ backgroundImage: `url(${racer})` }} />
      <div className="racer-body">
        <img src={racer} alt="" />
        <span className="racer-tear racer-tear--left" />
        <span className="racer-tear racer-tear--right" />
      </div>
    </div>
  </div>
)
